"""Database-grounded catalogue search, questions, ranking, offer comparison and shopping plans.
All returned IDs originate from stored dataset records. No real-time inventory inference.
"""
from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal
from difflib import SequenceMatcher
import math
import uuid
import re

from django.db import connection
from django.db.models import Q, Exists, OuterRef
from django.db.models.expressions import RawSQL
from django.utils import timezone

from .models import CandidateSet, Offer, Product, Shop
from .embedding import semantic_candidates
from .normalization import normalize, search_terms
from .matching import tokens as match_tokens, ranked as match_ranked, confident as match_confident, score_product as match_score

MAX_CANDIDATES = 2500
MAX_OFFERS = 50
MAX_ITEMS = 10


class ServiceError(ValueError):
    pass


def bounded_int(value, default=10, minimum=1, maximum=100):
    try:
        v = int(value)
    except (ValueError, TypeError):
        return default
    return max(minimum, min(maximum, v))


def numeric(value, *, minimum=None, maximum=None):
    if value in ('', None):
        return None
    try:
        val = float(str(value).replace(',', ''))
    except (ValueError, TypeError):
        raise ServiceError('عدد واردشده نامعتبر است.')
    if not math.isfinite(val) or (minimum is not None and val < minimum) or (maximum is not None and val > maximum):
        raise ServiceError('عدد خارج از بازهٔ مجاز است.')
    return val


def validate_filters(value):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ServiceError('filters باید یک شیء JSON باشد.')
    valid = {}
    if value.get('price_status') in ('known','unknown'):valid['price_status']=value['price_status']
    if 'lat' in value and 'lng' in value:
        valid['lat'],valid['lng']=_coords(value['lat'],value['lng'])
        valid['radius_km']=numeric(value.get('radius_km',5),minimum=.1,maximum=100)
        if valid['radius_km'] is None:raise ServiceError('شعاع جست‌وجو نامعتبر است.')
    for field in ('brand', 'category', 'area', 'provider'):
        if value.get(field):
            valid[field] = str(value[field]).strip()[:100]
    for field in ('max_price', 'min_price'):
        val = numeric(value.get(field), minimum=0, maximum=10**15)
        if val is not None:
            valid[field] = val
    if 'specs' in value:
        if not isinstance(value['specs'],dict) or len(value['specs'])>3:
            raise ServiceError('فیلتر مشخصات باید یک شیء با حداکثر ۳ ویژگی باشد.')
        specs={}
        for key,val in value['specs'].items():
            if not isinstance(key,str) or not re.fullmatch(r'[\w\u0600-\u06FF ]{1,65}',key) or '__' in key:
                raise ServiceError('نام مشخصهٔ نامعتبر است.')
            if not isinstance(val,(str,int,float)) or len(str(val))>100:
                raise ServiceError('مقدار مشخصهٔ نامعتبر است.')
            specs[key]=val
        valid['specs']=specs
    for field in ('installment','torobpay','fast_delivery','warranty','in_person'):
        if field in value:
            if not isinstance(value[field], bool):
                raise ServiceError(f'{field} باید true یا false باشد.')
            valid[field] = value[field]
    if valid.get('min_price', 0) > valid.get('max_price', float('inf')):
        raise ServiceError('حداقل قیمت بیشتر از حداکثر است.')
    return valid


def _product_query(query, filters):
    """Indexed SQL candidate retrieval: most-specific conjunction, then rare single tokens.
    Avoid arbitrary first 2500 rows from OR-ing common words; retain model recall.
    """
    terms=[x for x in match_tokens(query) if len(x)>=3]
    if not terms:terms=search_terms(query)
    if not terms:raise ServiceError('عبارت جست‌وجو لازم است.')
    base=Product.objects.all()
    indexed = False
    if connection.vendor == 'sqlite':
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM sqlite_master WHERE name='workspace_search'")
            indexed = cursor.fetchone() is not None
    def has(term):
        if indexed:
            phrase = ' AND '.join('"'+v.replace('"','""')+'"*' for v in normalize(term).split())
            return Q(pk__in=RawSQL('SELECT rowid FROM workspace_search WHERE workspace_search MATCH %s', [phrase]))
        condition=Q(normalized_title__icontains=term) | Q(search_document__icontains=term)
        # AS228 / AS-228 are both matched even if backfill has not run.
        m=re.match(r'^([a-z]{1,8})(\d[a-z0-9]*)$',term)
        if m:
            variant=m.group(1)+' '+m.group(2)
            condition |= Q(normalized_title__icontains=variant) | Q(search_document__icontains=variant)
        return condition
    significant=sorted(set(terms),key=lambda x:(bool(re.search(r'[a-z]',x) and re.search(r'\d',x)),len(x)),reverse=True)
    if len(significant)>=2:
        # Only pair highly distinctive terms, prefer a model anchor and a brand.
        for first,second in [(significant[0],t) for t in significant[1:4]]:
            qs=_nontext_filters(base.filter(has(first) & has(second)),filters)
            if qs.exists():return qs
    for term in significant[:6]:
        qs=_nontext_filters(base.filter(has(term)),filters)
        if qs.exists():return qs
    if connection.vendor=='postgresql':
        qs=_nontext_filters(base.filter(normalized_title__trigram_similar=normalize(query)),filters)
        if qs.exists():return qs
    return _nontext_filters(base.none(),filters)

def _payment_offer_q(kind, expected):
    # Imported challenge CSV stores payment_options JSON text inside Shop.extra;
    # the legacy bool columns are often NULL. Query BOTH sources.
    if kind=='torobpay':
        positive=(Q(shop__torobpay=True) | (Q(shop__extra__payment_options__icontains='ترب') &
                  Q(shop__extra__payment_options__icontains='in_person')))
    else:
        positive=(Q(shop__installment=True) | (Q(shop__extra__payment_options__icontains='provider_name') &
                  ~Q(shop__extra__payment_options__exact='[]')))
    return positive if expected else ~positive


def _payment_shop_q(kind, expected):
    if kind=='torobpay':
        positive=(Q(torobpay=True) | (Q(extra__payment_options__icontains='ترب') &
                   Q(extra__payment_options__icontains='in_person')))
    else:
        positive=(Q(installment=True) | (Q(extra__payment_options__icontains='provider_name') &
                   ~Q(extra__payment_options__exact='[]')))
    return positive if expected else ~positive

def _nontext_filters(qs, filters):
    if filters.get('brand'):
        qs = qs.filter(brand__icontains=filters['brand'])
    if filters.get('category'):
        qs = qs.filter(category__icontains=filters['category'])
    for key, value in filters.get('specs',{}).items():
        field='specs__'+key
        if isinstance(value,str) and value.isdecimal():
            qs=qs.filter(Q(**{field:value}) | Q(**{field:int(value)}))
        else:
            qs=qs.filter(**{field:value})
    if any(x in filters for x in ('min_price','max_price','installment','torobpay','fast_delivery','area','provider','price_status','warranty','in_person','lat')):
        offers = Offer.objects.filter(product_id=OuterRef('pk'))
        if filters.get('price_status'):offers=offers.filter(price__isnull=filters['price_status']=='unknown')
        if filters.get('warranty'):offers=offers.exclude(warranty='')
        if filters.get('in_person'):offers=offers.filter(shop__extra__payment_options__icontains='in_person')
        if 'lat' in filters:
            nearby=[s.id for s in Shop.objects.exclude(lat=None).exclude(lng=None).only('id','lat','lng') if _haversine(filters['lat'],filters['lng'],s.lat,s.lng)<=filters['radius_km']]
            offers=offers.filter(shop_id__in=nearby)
        if 'min_price' in filters:
            offers = offers.filter(price__gte=Decimal(str(filters['min_price'])), price_unit__iexact='toman')
        if 'max_price' in filters:
            offers = offers.filter(price__lte=Decimal(str(filters['max_price'])), price_unit__iexact='toman')
        for kind in ('installment','torobpay'):
            if kind in filters:offers=offers.filter(_payment_offer_q(kind,filters[kind]))
        if 'area' in filters:offers=offers.filter(Q(shop__extra__location_label__icontains=filters['area'])|Q(shop__address__icontains=filters['area']))
        if 'provider' in filters:offers=offers.filter(shop__extra__payment_options__icontains=filters['provider'])
        if 'fast_delivery' in filters:
            expression=Q(shop__extra__supports_fast_delivery__icontains='true')
            offers=offers.filter(expression if filters['fast_delivery'] else ~expression)
        qs = qs.annotate(has_qualifying_offer=Exists(offers)).filter(has_qualifying_offer=True)
    return qs


def _get_set(candidate_set_id, session_key):
    try:
        uid = uuid.UUID(str(candidate_set_id))
    except (ValueError, TypeError, AttributeError):
        raise ServiceError('شناسهٔ مجموعهٔ نامعتبر است.')
    cs = CandidateSet.objects.filter(id=uid, session_key=session_key, created_at__gte=timezone.now()-timedelta(hours=24)).first()
    if not cs:
        raise ServiceError('مجموعهٔ انتخابی یافت نشد یا منقضی شده است.')
    return cs


def _best_match_order(products, query):
    def doc(p):
        return {'title':p.title_fa or p.title_en,'brand':p.brand,'category':p.category,
                'model':p.title_en,'offer_titles':getattr(p,'offer_titles','')}
    return sorted(products, key=lambda p: match_score(query,doc(p)),reverse=True)


def search_products(query, filters=None, session_key=''):
    filters=validate_filters(filters)
    query=str(query or '').strip()[:300]
    if not session_key:raise ServiceError('شناسهٔ نشست معتبر نیست.')
    qs=_product_query(query,filters)
    lexical_cap=1500
    ids=list(qs.values_list('id',flat=True)[:lexical_cap+1])
    limited=len(ids)>lexical_cap
    ids=ids[:lexical_cap]
    # Offer titles frequently contain model names absent from catalogue titles.
    if len(ids)<20:
        terms=sorted(set(x for x in match_tokens(query) if len(x)>=4),key=len,reverse=True)
        if terms:
            condition=Q(title__icontains=terms[0])
            if len(terms)>1: condition |= Q(title__icontains=terms[1])
            offer_ids=list(Offer.objects.filter(condition).values_list('product_id',flat=True).distinct()[:1000])
            if offer_ids:
                allowed=set(_nontext_filters(Product.objects.filter(id__in=offer_ids),filters).values_list('id',flat=True))
                ids=list(dict.fromkeys(ids+[pid for pid in offer_ids if pid in allowed]))
    semantic_scores={}
    semantic_matches=semantic_candidates(query,150)
    if semantic_matches:
        allowed=set(_nontext_filters(Product.objects.filter(pk__in=[p for p,_ in semantic_matches]),filters).values_list('id',flat=True))
        for pid,sc in semantic_matches:
            if pid in allowed:
                semantic_scores[str(pid)]=sc
                if pid not in ids:ids.append(pid)
    products=list(Product.objects.filter(id__in=ids)) if ids else []
    # Seller wording often supplies variants and model tokens missing from BaseProduct.
    offer_titles=defaultdict(list)
    if ids:
        for pid,title in Offer.objects.filter(product_id__in=ids).values_list('product_id','title')[:5500]:
            if title and len(offer_titles[pid])<5:offer_titles[pid].append(title)
    ranked=match_ranked(query,[{'id':p.id,'title':p.title_fa or p.title_en,'title_en':p.title_en,
         'brand':p.brand,'category':p.category,'model':p.title_en,
         'offer_titles':' '.join(offer_titles[p.id])} for p in products],cutoff=.17)
    score_by_id={x['id']:sc for sc,x in ranked}
    ids=[x['id'] for _,x in ranked]
    pmap={p.id:p for p in products}
    top=[pmap[i] for i in ids]
    # Some product-only queries should not be marked exact based merely on a substring.
    mode='exact' if match_confident(ranked) else 'discovery'
    cs=CandidateSet.objects.create(session_key=session_key,query=query,filters=filters,
        product_ids=ids,semantic_scores=semantic_scores,total_matches=len(ids))
    stale=list(CandidateSet.objects.filter(session_key=session_key).order_by('-created_at').values_list('id',flat=True)[25:])
    if stale:CandidateSet.objects.filter(id__in=stale).delete()
    return {'candidate_set_id':str(cs.id),'count':len(ids),'count_is_lower_bound':limited,
            'mode':mode,'exact_product_ids':ids[:1] if mode=='exact' else [],
            'query':query,'filters':filters,'products':[_product(p) for p in top[:6]],
            'match_scores':[{'product_id':i,'score':score_by_id[i]} for i in ids[:6]],
            'semantic_enabled_for_query':bool(semantic_matches),
            'notice':'آفر و قیمت ثبت‌شده به معنی موجودی لحظه‌ای نیست؛ پیش از مراجعه تأیید کنید.'}

def _product(p):
    return {'id':p.id,'source_id':p.source_id, 'title':p.title_fa or p.title_en,
            'title_en':p.title_en,'brand':p.brand,'category':p.category,
            'description':p.description[:500], 'specs':p.specs if isinstance(p.specs, (dict,list)) else None,
            'image_url':p.image_url if p.image_url.startswith(('http://','https://')) else ''}


def _extra_json(value):
    if isinstance(value,(list,dict)):return value
    if not isinstance(value,str):return None
    try:
        import json
        return json.loads(value)
    except (ValueError,TypeError):return None


def _shop(s):
    extra=s.extra or {}
    payments=_extra_json(extra.get('payment_options')) or []
    if not isinstance(payments,list):payments=[]
    providers=[{'provider':str(x.get('provider_name','')),'channel':str(x.get('channel','unknown')),
                'min_price_toman':x.get('min_price_toman'),'max_price_toman':x.get('max_price_toman')}
               for x in payments if isinstance(x,dict) and x.get('provider_name')]
    fast=extra.get('supports_fast_delivery')
    if isinstance(fast,str):fast=fast.lower() in ('true','1','yes')
    name_verified=bool(s.instagram or s.website)
    return {'id':s.id,'source_id':s.source_id,
            'name':s.name if name_verified else 'فروشگاه با شناسه '+s.source_id[-6:],
            'address':s.address,'area':extra.get('location_label') or '',
            'lat':s.lat,'lng':s.lng,
            'installment':bool(providers) if s.installment is None else s.installment,
            'torobpay':any('ترب' in x['provider'] and x['channel']=='in_person' for x in providers) if s.torobpay is None else s.torobpay,
            'payment_options':providers,'fast_delivery':fast if isinstance(fast,bool) else None,
            'working_hours':s.working_hours,'instagram':s.instagram,'website':s.website,
            'name_may_be_pseudonymous':not name_verified}


def _offer(o, distance_km=None):
    w=_extra_json(o.warranty) or o.warranty or None
    return {'id':o.id,'source_id':(o.extra or {}).get('offer_id',''), 'product_id':o.product_id,
            'shop':_shop(o.shop),'title':o.title,
            'price':float(o.price) if o.price is not None else None,
            'price_unit':o.price_unit or 'نامشخص','warranty':w,
            'updated_at':o.price_updated_at.isoformat() if o.price_updated_at else None,
            'update_age_days':round((timezone.now()-o.price_updated_at).total_seconds()/86400,1) if o.price_updated_at else None,
            'distance_km':round(distance_km,2) if distance_km is not None else None,
            'stock_verified':False}

def _filter_offer_qs(qs, filters):
    if filters.get('price_status'):qs=qs.filter(price__isnull=filters['price_status']=='unknown')
    if filters.get('warranty'):qs=qs.exclude(warranty='')
    if filters.get('in_person'):qs=qs.filter(shop__extra__payment_options__icontains='in_person')
    if 'lat' in filters:
        nearby=[s.id for s in Shop.objects.exclude(lat=None).exclude(lng=None).only('id','lat','lng') if _haversine(filters['lat'],filters['lng'],s.lat,s.lng)<=filters['radius_km']]
        qs=qs.filter(shop_id__in=nearby)
    if 'min_price' in filters:
        qs=qs.filter(price__gte=filters['min_price'],price_unit__iexact='toman')
    if 'max_price' in filters:
        qs=qs.filter(price__lte=filters['max_price'],price_unit__iexact='toman')
    for kind in ('installment','torobpay'):
        if kind in filters:qs=qs.filter(_payment_offer_q(kind,filters[kind]))
    if 'area' in filters:qs=qs.filter(Q(shop__extra__location_label__icontains=filters['area'])|Q(shop__address__icontains=filters['area']))
    if 'provider' in filters:qs=qs.filter(shop__extra__payment_options__icontains=filters['provider'])
    if 'fast_delivery' in filters:
        cond=Q(shop__extra__supports_fast_delivery__icontains='true')
        qs=qs.filter(cond if filters['fast_delivery'] else ~cond)
    return qs


def _min_toman_prices(ids, filters=None):
    from django.db.models import Count, Max
    qs=_filter_offer_qs(Offer.objects.filter(product_id__in=ids),filters or {})
    return {row['product_id']:row for row in qs.values('product_id').annotate(
        seller_count=Count('shop_id',distinct=True),
        latest_update=Max('price_updated_at'),
    )}


def _prices(ids, filters=None):
    from django.db.models import Min
    qs=_filter_offer_qs(Offer.objects.filter(product_id__in=ids,price__isnull=False,price_unit__iexact='toman'),filters or {})
    return dict(qs.values('product_id').annotate(p=Min('price')).values_list('product_id','p'))


def get_facets(candidate_set_id, session_key):
    cs = _get_set(candidate_set_id,session_key)
    ids = cs.product_ids
    products = list(Product.objects.filter(id__in=ids).only('id','brand','category','specs'))
    prices = [float(v) for v in _prices(ids,cs.filters).values()]
    brands = Counter((p.brand or 'نامشخص').strip() for p in products)
    categories = Counter((p.category or 'نامشخص').strip() for p in products)
    spec_options = defaultdict(Counter)
    for p in products[:500]:
        if isinstance(p.specs, dict):
            for k, v in list(p.specs.items())[:16]:
                if isinstance(v, (str,int,float)) and 0 < len(str(v)) < 80:
                    spec_options[str(k)[:65]][str(v)] += 1
    if prices:
        low,high = min(prices),max(prices)
        cuts = [round(low+(high-low)*i/4) for i in range(5)]
        hist = [sum(1 for p in prices if (cuts[i] <= p < cuts[i+1] if i<3 else cuts[i]<=p<=cuts[i+1])) for i in range(4)]
    else:
        cuts,hist=[],[]
    return {'candidate_set_id':str(cs.id),'count':len(ids),'brands':dict(brands.most_common(15)),
            'categories':dict(categories.most_common(15)),
            'price_unit':'toman','priced_products':len(prices),'price_edges':cuts,'price_histogram':hist,
            'specs':{k:dict(v.most_common(8)) for k,v in spec_options.items() if len(v)>1 and sum(v.values())>=6}}


def ask_clarification(candidate_set_id, session_key):
    cs = _get_set(candidate_set_id,session_key)
    facets = get_facets(candidate_set_id,session_key)
    n = facets['count']
    if n <= 3:
        return {'question':None,'reason':'تعداد گزینه‌ها کم است؛ می‌توانید مستقیماً مقایسه کنید.'}
    possibilities=[]
    for key, label, question in [
        ('brands','brand','برند موردنظرتان چیست؟'),
        ('categories','category','کدام دسته محصول را ترجیح می‌دهید؟')]:
        items = [(k,v) for k,v in facets[key].items() if k!='نامشخص']
        # balanced split with at least two meaningful choices; select most informative dimension
        if len(items)>=2 and label not in cs.filters:
            popular=items[:6]
            covered=sum(c for _,c in popular)
            dominance=max(c for _,c in popular)/max(1,covered)
            if covered>=max(4, n*.45) and dominance < .85:
                gain = -sum((c/covered)*math.log2(c/covered) for _,c in popular)
                possibilities.append((gain,{'question':question,'field':label,
                                         'options':[{'label':x,'value':x,'count':y} for x,y in popular],
                                         'allow_free_text':True,'reason':'این سؤال گزینه‌های بیشتری را از هم جدا می‌کند.'}))
    if 'specs' not in cs.filters:
        for spec_key, distribution in facets['specs'].items():
            total=sum(distribution.values())
            if len(distribution)>=2 and total>=max(5,min(n,500)*.35):
                popular=list(distribution.items())[:6]
                coverage=sum(c for _,c in popular)
                if max(c for _,c in popular)/max(1,coverage)<.9:
                    gain=-sum((c/coverage)*math.log2(c/coverage) for _,c in popular)
                    possibilities.append((gain*.85,{'question':f'برای «{spec_key}» کدام گزینه را می‌خواهید؟',
                        'field':'specs.'+spec_key,
                        'options':[{'label':v,'value':v,'count':count} for v,count in popular],
                        'allow_free_text':True,'reason':'این مشخصه بین محصولات مشاهده‌شده تفاوت ایجاد می‌کند.'}))
    if 'max_price' not in cs.filters and facets['priced_products']>=5 and len(set(facets['price_edges']))>=3:
        cuts=facets['price_edges']
        possibilities.append((1.5,{'question':'حداکثر بودجهٔ شما چقدر است؟','field':'max_price',
            'options':[{'label':f'تا {int(cuts[i]):,} تومان','value':cuts[i]} for i in (1,2,3,4)],
            'allow_free_text':True,'reason':'فیلتر بودجه آفرهای مناسب را محدود می‌کند.'}))
    if not possibilities:
        return {'question':None,'reason':'ملاک تفکیک معناداری در داده‌های موجود پیدا نشد.'}
    return max(possibilities,key=lambda item:item[0])[1]


def clarify(candidate_set_id, session_key, field, value):
    cs = _get_set(candidate_set_id,session_key)
    if isinstance(field,str) and field.startswith('specs.'):
        key=field[6:]
        if key not in get_facets(candidate_set_id,session_key)['specs']:
            raise ServiceError('مشخصهٔ منتخب در مجموعهٔ فعلی یافت نشد.')
        filters={**cs.filters,'specs':{**cs.filters.get('specs',{}),key:value}}
    else:
        if field not in ('brand','category','max_price','min_price','installment','torobpay'):
            raise ServiceError('فیلد پاسخ مجاز نیست.')
        filters={**cs.filters, field:value}
    return search_products(cs.query,filters,session_key)


def fetch_candidates(candidate_set_id, session_key, offset=0, limit=12, product_ids=None):
    cs = _get_set(candidate_set_id,session_key)
    offset=bounded_int(offset,default=0,minimum=0,maximum=MAX_CANDIDATES)
    limit=bounded_int(limit,default=12,minimum=1,maximum=40)
    ids=cs.product_ids
    if product_ids is not None:
        if not isinstance(product_ids,list):
            raise ServiceError('product_ids باید آرایه باشد.')
        allowed={int(i) for i in ids}
        ids=[int(i) for i in product_ids[:40] if str(i).isdigit() and int(i) in allowed]
    else:
        ids=ids[offset:offset+limit]
    pmap=Product.objects.in_bulk(ids)
    return {'candidate_set_id':str(cs.id),'total':len(cs.product_ids),
            'offset':offset,'products':[_product(pmap[i]) for i in ids if i in pmap]}


def rank_candidates(candidate_set_id, session_key, preferences=None, limit=12):
    cs=_get_set(candidate_set_id,session_key)
    raw_prefs = preferences or {}
    prefs=validate_filters(raw_prefs)
    origin=None
    if isinstance(raw_prefs,dict) and ('lat' in raw_prefs or 'lng' in raw_prefs):
        origin=_coords(raw_prefs.get('lat'),raw_prefs.get('lng'))
    ids=cs.product_ids[:MAX_CANDIDATES]
    pmap=Product.objects.in_bulk(ids)
    offer_filters={**cs.filters,**prefs}
    metadata=_min_toman_prices(ids,offer_filters)
    prices=_prices(ids,offer_filters)
    near={}
    if origin:
        for r in Offer.objects.filter(product_id__in=ids,shop__lat__isnull=False,shop__lng__isnull=False).values('product_id','shop__lat','shop__lng'):
            dist=_haversine(*origin,r['shop__lat'],r['shop__lng'])
            pid=r['product_id']
            if pid not in near or dist<near[pid]:near[pid]=dist
    words=set(search_terms(cs.query))
    query_n=normalize(cs.query)
    results=[]
    for id in ids:
        p=pmap.get(id)
        if not p:
            continue
        title=p.normalized_title or normalize(p.title_fa or p.title_en)
        doc=p.search_document or title
        matches=sum(1 for w in words if w in doc)/max(1,len(words))
        text_score=.45*matches+.35*SequenceMatcher(None,query_n[:120],title[:120]).ratio() + .20*int(title==query_n)
        sellers=metadata.get(id,{}).get('seller_count',0)
        coverage=min(1,math.log1p(sellers)/math.log1p(12))
        price=float(prices[id]) if id in prices else None
        budget=prefs.get('max_price',cs.filters.get('max_price'))
        budget_score=(.7 if price is not None and budget is None else
                      (1 if price is not None and price<=budget else 0) if budget is not None else .3)
        latest=metadata.get(id,{}).get('latest_update')
        age=(timezone.now()-latest).total_seconds()/86400 if latest else None
        freshness=math.exp(-max(0,age)/30) if age is not None else 0
        semantic=cs.semantic_scores.get(str(id))
        match_relevance=match_score(cs.query,{'title':p.title_fa or p.title_en,'title_en':p.title_en,'brand':p.brand,'category':p.category})
        relevance=(.85*match_relevance+.15*float(semantic)) if semantic is not None else match_relevance
        proximity=math.exp(-near[id]/10) if id in near else 0
        score=(.55*relevance+.14*coverage+.12*budget_score+.09*freshness+.10*proximity) if origin else               (.62*relevance+.15*coverage+.12*budget_score+.11*freshness)
        reasons=[]
        if title==query_n: reasons.append('تطابق دقیق عنوان')
        elif matches>=.8: reasons.append('مطابقت بالای مشخصات با جست‌وجو')
        if sellers: reasons.append(f'{sellers} فروشندهٔ ثبت‌شده')
        if age is not None and age<=7: reasons.append('قیمت اخیراً به‌روزرسانی شده')
        if price is not None: reasons.append('حداقل قیمت ثبت‌شده در واحد تومان')
        if id in near: reasons.append(f'نزدیک‌ترین فروشنده حدود {near[id]:.1f} کیلومتر فاصلهٔ مستقیم دارد')
        results.append({'product':_product(p),'score':round(score,4),'seller_count':sellers,
                        'min_price_toman':price,'updated_at':latest.isoformat() if latest else None,
                        'reasons':reasons})
    results.sort(key=lambda r:(r['score'],r['seller_count']),reverse=True)
    return {'candidate_set_id':str(cs.id),'count':len(ids),'ranking':results[:bounded_int(limit,12,1,30)],
            'method':'transparent-weighted-v1','notice':'امتیازها کیفیت واقعی یا موجودی قطعی محصول را نشان نمی‌دهند.'}


def _haversine(a,b,c,d):
    radius=6371.0088
    dlat=math.radians(c-a); dlon=math.radians(d-b)
    h=math.sin(dlat/2)**2+math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(dlon/2)**2
    return 2*radius*math.asin(min(1,math.sqrt(h)))


def _coords(lat,lng):
    lat=numeric(lat,minimum=-90,maximum=90)
    lng=numeric(lng,minimum=-180,maximum=180)
    if lat is None or lng is None:
        raise ServiceError('مختصات عرض و طول جغرافیایی لازم است.')
    return lat,lng


def _offer_filters(filters):
    filters=validate_filters(filters)
    return filters


def find_shops_for_product(product_id, filters=None):
    filters=_offer_filters(filters)
    try:
        p=Product.objects.get(pk=int(product_id))
    except (Product.DoesNotExist,ValueError,TypeError):
        raise ServiceError('محصول یافت نشد.')
    qs=_filter_offer_qs(Offer.objects.filter(product=p).select_related('shop','product'),filters)
    qs=qs.order_by('price','id')
    offers=list(qs[:MAX_OFFERS+1]); limited=len(offers)>MAX_OFFERS
    return {'product':_product(p),'offers':[_offer(o) for o in offers[:MAX_OFFERS]],
            'offer_count':len(offers[:MAX_OFFERS]),'shop_count':len({o.shop_id for o in offers[:MAX_OFFERS]}),
            'limited':limited,'notice':'آفر نشان‌دهندهٔ موجودی تأییدشده نیست؛ پیش از مراجعه استعلام کنید.'}


def compare_offers(offer_ids):
    if not isinstance(offer_ids,list) or not 1<=len(offer_ids)<=30:
        raise ServiceError('بین ۱ تا ۳۰ شناسهٔ آفر لازم است.')
    ids=[]
    for i in offer_ids:
        try: ids.append(int(i))
        except (TypeError,ValueError): raise ServiceError('شناسهٔ آفر نامعتبر است.')
    offers=list(Offer.objects.filter(id__in=ids).select_related('shop','product'))
    offers.sort(key=lambda o:(o.price_unit or 'نامشخص',o.price is None, o.price if o.price is not None else Decimal('Infinity')))
    return {'offers':[_offer(o) for o in offers],
            'units_present':sorted({o.price_unit or 'نامشخص' for o in offers}),
            'notice':'قیمت‌های با واحد متفاوت قابل مقایسهٔ مستقیم نیستند؛ موجودی فروشگاه‌ها تأیید نشده است.'}


def find_nearby_shops(lat,lng,radius_km=5,product_id=None,installment=None):
    lat,lng=_coords(lat,lng)
    radius=numeric(radius_km,minimum=.1,maximum=50) or 5
    delta_lat=radius/111.0
    delta_lng=radius/(111*max(.05,abs(math.cos(math.radians(lat)))))
    shops=Shop.objects.filter(lat__range=(lat-delta_lat,lat+delta_lat),lng__range=(lng-delta_lng,lng+delta_lng))
    if product_id is not None:
        try: pid=int(product_id)
        except (TypeError,ValueError): raise ServiceError('شناسهٔ محصول نامعتبر است.')
        shops=shops.filter(offers__product_id=pid)
    if installment is not None:
        if not isinstance(installment,bool): raise ServiceError('installment باید بولی باشد.')
        shops=shops.filter(_payment_shop_q('installment',installment))
    matches=[]
    for s in shops.distinct():
        d=_haversine(lat,lng,s.lat,s.lng)
        if d<=radius:
            matches.append({'shop':_shop(s),'distance_km':round(d,2)})
    matches.sort(key=lambda x:x['distance_km'])
    return {'shops':matches[:50],'total_in_radius':len(matches),'distance_type':'straight_line',
            'notice':'فقط فروشگاه‌های موجود در دیتاست؛ فاصله، شعاع مستقیم است نه مسافت مسیریابی.'}


def build_shopping_plan(product_ids,lat=None,lng=None,installment=None):
    if not isinstance(product_ids,list) or not (1<=len(product_ids)<=MAX_ITEMS):
        raise ServiceError('بین ۱ تا ۱۰ محصول برای برنامهٔ خرید انتخاب کنید.')
    try: ids=list(dict.fromkeys(int(x) for x in product_ids))
    except (TypeError,ValueError): raise ServiceError('شناسه‌های محصول نامعتبر هستند.')
    origin=_coords(lat,lng) if lat is not None or lng is not None else None
    pmap=Product.objects.in_bulk(ids)
    if len(pmap)!=len(ids): raise ServiceError('یکی از محصولات انتخاب‌شده در دیتابیس وجود ندارد.')
    offers=list(Offer.objects.filter(product_id__in=ids).select_related('shop','product').order_by('price','id')[:1200])
    if installment is not None:
        if not isinstance(installment,bool): raise ServiceError('installment باید بولی باشد.')
        offers=[o for o in offers if bool(_shop(o.shop)['installment']) is installment]
    byshop=defaultdict(dict)
    for o in offers:
        prior=byshop[o.shop_id].get(o.product_id)
        if prior is None or (o.price is not None and o.price_unit==prior.price_unit and (prior.price is None or o.price<prior.price)):
            byshop[o.shop_id][o.product_id]=o
    remaining=set(ids); path=[]; current=origin
    while remaining and byshop:
        choices=[]
        for sid,listing in byshop.items():
            covered=set(listing)&remaining
            if not covered:continue
            s=next(iter(listing.values())).shop
            dist=_haversine(*current,s.lat,s.lng) if current and s.lat is not None and s.lng is not None else None
            # prioritize coverage, then straight-line distance
            choices.append((len(covered), -(dist if dist is not None else 9999),sid,covered,dist))
        if not choices: break
        _,_,sid,covered,dist=max(choices,key=lambda x:(x[0],x[1]))
        listing=byshop.pop(sid)
        store=next(iter(listing.values())).shop
        path.append({'shop':_shop(store),'straight_line_km_from_previous':round(dist,2) if dist is not None else None,
                     'items':[{'product':_product(pmap[pid]),'offer':_offer(listing[pid])} for pid in sorted(covered)]})
        remaining-=covered
        if store.lat is not None and store.lng is not None:current=(store.lat,store.lng)
    return {'stops':path,'covered_product_ids':[x for x in ids if x not in remaining],
            'missing_product_ids':[x for x in ids if x in remaining],
            'route_quality':'greedy-store-coverage+straight-line-nearest','exact_route':False,
            'notice':'طرح تقریبی است؛ مسیر خیابانی، زمان سفر و موجودی واقعی محاسبه یا تأیید نشده‌اند.'}


def render_workspace(view,product_ids=None,offer_ids=None,shop_ids=None,query=None,category=None,departure=None,mode='driving',radius_km=2,shopping_minutes=10):
    if view not in ('results','map','compare','sellers','visit','mission'):raise ServiceError('نمای درخواستی معتبر نیست.')
    def checked(values,model,limit):
        if values is None:return []
        if not isinstance(values,list) or len(values)>limit:raise ServiceError('تعداد شناسه‌ها نامعتبر است.')
        try:ids=list(dict.fromkeys(int(v) for v in values))
        except (ValueError,TypeError):raise ServiceError('شناسه نامعتبر است.')
        found=list(model.objects.filter(id__in=ids))
        if len(found)!=len(ids):raise ServiceError('یکی از شناسه‌ها در دادهٔ واقعی وجود ندارد.')
        ordered={row.id:row for row in found}
        return [ordered[id] for id in ids]
    products=checked(product_ids,Product,4);offers=checked(offer_ids,Offer,30);shops=checked(shop_ids,Shop,100)
    if offers and not products:
        products=list(Product.objects.filter(id__in=list(dict.fromkeys(o.product_id for o in offers))))
    if view=='visit' and not offers:raise ServiceError('برای مراجعه یک آفر واقعی انتخاب کنید.')
    result={'view':view,'source_product_ids':[p.source_id for p in products],'source_offer_ids':[(o.extra or {}).get('offer_id') for o in offers],'source_shop_ids':[s.source_id for s in shops]}
    if view=='mission':
        from datetime import datetime
        if not isinstance(query,str) or not query.strip() or len(query)>100:raise ServiceError('نیاز خرید فوری را مشخص کنید.')
        if departure:
            try:datetime.strptime(departure,'%Y-%m-%dT%H:%M')
            except (ValueError,TypeError):raise ServiceError('زمان حرکت نامعتبر است.')
        if mode not in ('driving','walking'):raise ServiceError('روش رفتن نامعتبر است.')
        radius=numeric(radius_km,minimum=.5,maximum=30)
        if radius is None:raise ServiceError('شعاع نامعتبر است.')
        result['mission']={'query':query,'category':str(category or '')[:100],'mode':mode,'radius':radius,'shoppingMinutes':bounded_int(shopping_minutes,10,5,60)}
        if departure:result['mission']['departure']=departure
    return result

DISPATCH={
    'render_workspace':render_workspace,
    'search_products':search_products,'get_facets':get_facets,'ask_clarification':ask_clarification,
    'fetch_candidates':fetch_candidates,'find_shops_for_product':find_shops_for_product,
    'compare_offers':compare_offers,'find_nearby_shops':find_nearby_shops,
    'rank_candidates':rank_candidates,'build_shopping_plan':build_shopping_plan,
}
SESSION_TOOLS={'search_products','get_facets','ask_clarification','fetch_candidates','rank_candidates'}


def execute(name, args, session_key):
    if name not in DISPATCH or not isinstance(args,dict):
        raise ServiceError('ابزار یا ورودی نامعتبر است.')
    if name in SESSION_TOOLS:
        args={**args,'session_key':session_key}
        args.pop('session_id',None)
    # explicit kwargs means unexpected LLM-provided keys are safely rejected
    try:
        return DISPATCH[name](**args)
    except (TypeError,ValueError) as exc:
        if isinstance(exc,ServiceError):raise
        raise ServiceError('پارامترهای ابزار نامعتبرند.') from exc
