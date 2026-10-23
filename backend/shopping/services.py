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
from django.utils import timezone

from .models import CandidateSet, Offer, Product, Shop
from .embedding import semantic_candidates
from .normalization import normalize, search_terms

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
    for field in ('brand', 'category'):
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
    for field in ('installment','torobpay'):
        if field in value:
            if not isinstance(value[field], bool):
                raise ServiceError(f'{field} باید true یا false باشد.')
            valid[field] = value[field]
    if valid.get('min_price', 0) > valid.get('max_price', float('inf')):
        raise ServiceError('حداقل قیمت بیشتر از حداکثر است.')
    return valid


def _product_query(query, filters):
    nq = normalize(query)
    if not nq:
        raise ServiceError('عبارت جست‌وجو لازم است.')
    qs = Product.objects.all()
    terms = search_terms(query)
    if connection.vendor == 'postgresql':
        condition = Q(normalized_title__icontains=nq) | Q(search_document__icontains=nq)
        for t in terms:
            condition |= Q(normalized_title__trigram_similar=t)
            if len(t) >= 3:
                condition |= Q(search_document__icontains=t)
        # More conservative than a generic substring match on single token, with full-term fallback.
        if len(terms) > 1:
            condition |= Q(search_document__contains=' '.join(terms))
        qs = qs.filter(condition)
    else:
        condition = Q(normalized_title__icontains=nq) | Q(search_document__icontains=nq)
        for t in terms[:4]:
            condition |= Q(normalized_title__icontains=t) | Q(search_document__icontains=t)
        qs = qs.filter(condition)
    return _nontext_filters(qs, filters)


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
    if any(x in filters for x in ('min_price','max_price','installment','torobpay')):
        offers = Offer.objects.filter(product_id=OuterRef('pk'))
        if 'min_price' in filters:
            offers = offers.filter(price__gte=Decimal(str(filters['min_price'])), price_unit__iexact='toman')
        if 'max_price' in filters:
            offers = offers.filter(price__lte=Decimal(str(filters['max_price'])), price_unit__iexact='toman')
        if 'installment' in filters:
            offers = offers.filter(shop__installment=filters['installment'])
        if 'torobpay' in filters:
            offers = offers.filter(shop__torobpay=filters['torobpay'])
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
    query_n = normalize(query)
    words = set(search_terms(query))
    def score(p):
        title = p.normalized_title or normalize(p.title_fa or p.title_en)
        document = p.search_document or normalize(' '.join([p.title_fa, p.title_en, p.brand, p.category]))
        matched = sum(1 for w in words if w in document)
        return (1 if query_n == title else 0, matched / max(1,len(words)),
                1 if title.startswith(query_n) else 0,
                SequenceMatcher(None, query_n[:130], title[:130]).ratio())
    return sorted(products, key=score, reverse=True)


def search_products(query, filters=None, session_key=''):
    filters = validate_filters(filters)
    query = str(query or '').strip()[:180]
    if not session_key:
        raise ServiceError('شناسهٔ نشست معتبر نیست.')
    qs = _product_query(query, filters)
    semantic_matches = semantic_candidates(query, 250)
    # bounded snapshot. Report capped instead of pretending this is a full-catalogue count.
    lexical_cap=MAX_CANDIDATES - (250 if semantic_matches else 0)
    exact_ids=list(_nontext_filters(Product.objects.filter(normalized_title=normalize(query)),filters).values_list('id',flat=True)[:10])
    ids = list(qs.values_list('id',flat=True)[:lexical_cap+1])
    limited = len(ids) > lexical_cap
    ids = list(dict.fromkeys(exact_ids+ids[:lexical_cap]))[:lexical_cap]
    semantic_scores={}
    if semantic_matches:
        # Restrict semantic hits by the SAME nontextual filters as lexical hits.
        allowed = Product.objects.filter(pk__in=[pid for pid,_ in semantic_matches])
        allowed = _nontext_filters(allowed,filters)
        allowed_ids=set(allowed.values_list('id',flat=True))
        for pid,score in semantic_matches:
            if pid in allowed_ids:
                semantic_scores[str(pid)] = score
                if pid not in ids and len(ids) < MAX_CANDIDATES:
                    ids.append(pid)
    if ids:
        products = list(Product.objects.filter(id__in=ids))
        products = _best_match_order(products, query)
        ids = [p.id for p in products]
    exact = [p for p in (products if ids else []) if p.normalized_title == normalize(query)]
    cs = CandidateSet.objects.create(session_key=session_key, query=query, filters=filters,
                                     product_ids=ids,semantic_scores=semantic_scores,total_matches=len(ids))
    # small bound on per-session retained sets
    stale = list(CandidateSet.objects.filter(session_key=session_key).order_by('-created_at').values_list('id',flat=True)[25:])
    if stale:
        CandidateSet.objects.filter(id__in=stale).delete()
    return {'candidate_set_id':str(cs.id), 'count':len(ids), 'count_is_lower_bound':limited,
            'mode':'exact' if exact and len(exact)<=3 else 'discovery',
            'exact_product_ids':[p.id for p in exact[:3]],
            'query':query,'filters':filters,
            'products':[_product(p) for p in products[:6]] if ids else [],
            'semantic_enabled_for_query':bool(semantic_matches),
            'notice':'اطلاعات قیمت، موجودی و ساعت کار لحظه‌ای نیستند؛ پیش از مراجعه تأیید کنید.'}


def _product(p):
    return {'id':p.id,'source_id':p.source_id, 'title':p.title_fa or p.title_en,
            'title_en':p.title_en,'brand':p.brand,'category':p.category,
            'description':p.description[:500], 'specs':p.specs if isinstance(p.specs, (dict,list)) else None,
            'image_url':p.image_url if p.image_url.startswith(('http://','https://')) else ''}


def _shop(s):
    # Phone numbers and most names are pseudonymized in supplied challenge dataset.
    return {'id':s.id,'name':s.name,'address':s.address,'lat':s.lat,'lng':s.lng,
            'installment':s.installment,'torobpay':s.torobpay,
            'working_hours':s.working_hours,'instagram':s.instagram, 'website':s.website,
            'name_may_be_pseudonymous':not(bool(s.instagram) or bool(s.website))}


def _offer(o, distance_km=None):
    return {'id':o.id, 'product_id':o.product_id, 'shop':_shop(o.shop),
            'title':o.title,'price':float(o.price) if o.price is not None else None,
            'price_unit':o.price_unit or 'نامشخص', 'warranty':o.warranty,
            'updated_at':o.price_updated_at.isoformat() if o.price_updated_at else None,
            'update_age_days':round((timezone.now()-o.price_updated_at).total_seconds()/86400,1) if o.price_updated_at else None,
            'distance_km':round(distance_km,2) if distance_km is not None else None,
            'stock_verified':False}


def _filter_offer_qs(qs, filters):
    if 'min_price' in filters:
        qs=qs.filter(price__gte=filters['min_price'],price_unit__iexact='toman')
    if 'max_price' in filters:
        qs=qs.filter(price__lte=filters['max_price'],price_unit__iexact='toman')
    if 'installment' in filters:
        qs=qs.filter(shop__installment=filters['installment'])
    if 'torobpay' in filters:
        qs=qs.filter(shop__torobpay=filters['torobpay'])
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
        relevance=(.7*text_score+.3*float(semantic)) if semantic is not None else text_score
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
    qs=Offer.objects.filter(product=p).select_related('shop','product')
    if 'min_price' in filters: qs=qs.filter(price__gte=filters['min_price'],price_unit__iexact='toman')
    if 'max_price' in filters: qs=qs.filter(price__lte=filters['max_price'],price_unit__iexact='toman')
    if 'installment' in filters: qs=qs.filter(shop__installment=filters['installment'])
    if 'torobpay' in filters: qs=qs.filter(shop__torobpay=filters['torobpay'])
    qs=qs.order_by('price','id')
    offers=list(qs[:MAX_OFFERS+1]); limited=len(offers)>MAX_OFFERS
    return {'product':_product(p),'offers':[_offer(o) for o in offers[:MAX_OFFERS]],
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
        shops=shops.filter(installment=installment)
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
        offers=[o for o in offers if o.shop.installment is installment]
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


DISPATCH={
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
