"""Same-origin bridge from the real agent/tools to the Persian component registry."""
import hashlib
import json
import sqlite3
import threading
import time
import sys
from collections import OrderedDict
from pathlib import Path
from django.conf import settings
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from . import llm, services
from .models import Product, Offer
from .normalization import parse_simple_request
from .views import _session

_locks = [threading.Lock() for _ in range(64)]
_replies = OrderedDict()
_cache_lock = threading.Lock()

def owner(request, conversation):
    return hashlib.sha256((_session(request) + ':' + conversation).encode()).hexdigest()

def source_catalogue(product_ids=None, offer_ids=None, filters=None):
    path = settings.BASE_DIR.parent / '.local' / 'torob.sqlite'
    with sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True) as db:
        products = [json.loads(row[0]) for pid in dict.fromkeys(product_ids or []) for row in db.execute('SELECT payload FROM products WHERE id=?', (pid,))]
        ids = [p['id'] for p in products]
        offers = []
        if offer_ids:
            offers = [json.loads(row[0]) for oid in dict.fromkeys(offer_ids) for row in db.execute('SELECT payload FROM offers WHERE id=?', (oid,))]
        elif ids:
            offers = [json.loads(row[0]) for row in db.execute('SELECT payload FROM offers WHERE product_id IN ('+','.join('?' for _ in ids)+') ORDER BY price IS NULL,price', ids)]
        filters = filters or {}
        minimum = filters.get('min_price', filters.get('min'))
        maximum = filters.get('max_price', filters.get('max'))
        if minimum not in ('', None): offers = [o for o in offers if o['price'] is not None and o['price'] >= float(minimum)]
        if maximum not in ('', None): offers = [o for o in offers if o['price'] is not None and o['price'] <= float(maximum)]
        if filters.get('priceStatus',filters.get('price_status')) == 'known': offers = [o for o in offers if o['price'] is not None]
        if filters.get('priceStatus',filters.get('price_status')) == 'unknown': offers = [o for o in offers if o['price'] is None]
        if filters.get('warranty'):offers=[o for o in offers if o['warranty'] is not None]
        shops = [json.loads(row[0]) for sid in dict.fromkeys(o['shopId'] for o in offers) for row in db.execute('SELECT payload FROM shops WHERE id=?', (sid,))]
        if any(field in filters for field in ('provider','installment','torobpay','in_person','lat','area','fast_delivery')):
            allowed = set()
            for shop in shops:
                payments = shop['payments']
                if filters.get('in_person') and not any(p.get('channel')=='in_person' for p in payments): continue
                if 'lat' in filters and (shop['lat'] is None or shop['lon'] is None or services._haversine(filters['lat'],filters['lng'],shop['lat'],shop['lon'])>filters['radius_km']):continue
                if filters.get('provider') and not any(filters['provider'] in p.get('provider_name','') for p in payments): continue
                if 'installment' in filters and bool(payments)!=filters['installment']: continue
                if 'torobpay' in filters and any('ترب' in p.get('provider_name','') and p.get('channel')=='in_person' for p in payments)!=filters['torobpay']: continue
                if 'area' in filters and filters['area'] not in ((shop['area'] or '')+' '+(shop['address'] or '')):continue
                if 'fast_delivery' in filters and ('true' in json.dumps(shop['fastDelivery']).lower())!=filters['fast_delivery']:continue
                allowed.add(shop['id'])
            offers = [o for o in offers if o['shopId'] in allowed]
            shops = [s for s in shops if s['id'] in allowed]
        if filters:
            offered = {o['productId'] for o in offers}; products = [p for p in products if p['id'] in offered]
        return {'products':products,'offers':offers,'shops':shops,'total':len(products),'page':0,'source':'dataset'}

def context_for(result, key):
    cid = result.get('candidate_set_id')
    context = {'candidateSetId':cid, 'clarification':result.get('clarification')}
    if cid:
        cs = services._get_set(cid,key)
        context.update(query=cs.query, filters=cs.filters, count=len(cs.product_ids))
    return context

def assemble(raw, key, page=0):
    cid = raw.get('candidate_set_id')
    context = context_for(raw,key)
    page = max(0,min(10000,int(page)))
    chosen = []
    for row in raw.get('ranking',[]):
        if row.get('product',{}).get('source_id'): chosen.append(row['product']['source_id'])
    if cid:
        cs = services._get_set(cid,key)
        if page == 0 and raw.get('ranking'):
            first=[row['product']['id'] for row in raw['ranking'] if row.get('product',{}).get('id') in cs.product_ids]
            reordered=list(dict.fromkeys(first+cs.product_ids))
            if reordered!=cs.product_ids:
                cs.product_ids=reordered; cs.save(update_fields=['product_ids'])
        page_data = services.fetch_candidates(cid,key,offset=page*12,limit=12)
        chosen = [p['source_id'] for p in page_data['products']]
    resolved = raw.get('resolved_product_source_ids') or ([raw['resolved_product_source_id']] if raw.get('resolved_product_source_id') else [])
    ui=raw.get('ui') or {}
    if ui.get('source_product_ids'):resolved=ui['source_product_ids']
    chosen = list(dict.fromkeys(resolved + chosen))[:12]
    explicit_offers = [o['source_id'] for o in raw.get('offers',[]) if o.get('source_id')]
    if ui.get('source_offer_ids'):explicit_offers=ui['source_offer_ids']
    if explicit_offers and not resolved:
        resolved=list(dict.fromkeys(Offer.objects.filter(extra__offer_id__in=explicit_offers).values_list('product__source_id',flat=True)))
        chosen=resolved[:12]
    if ui.get('source_product_ids'):chosen=ui['source_product_ids']
    for event in raw.get('tool_results',[]):
        for product in event.get('result',{}).get('products',[]):
            if not chosen and product.get('source_id'): chosen.append(product['source_id'])
    catalogue = source_catalogue(chosen, explicit_offers or None, context.get('filters'))
    if ui.get('source_shop_ids'):
        path=settings.BASE_DIR.parent / '.local' / 'torob.sqlite'
        with sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True) as db:
            catalogue['shops']=[json.loads(row[0]) for sid in ui['source_shop_ids'] for row in db.execute('SELECT payload FROM shops WHERE id=?',(sid,))]
    catalogue['total'] = len(resolved) if resolved else context.get('count',len(catalogue['products'])); catalogue['page'] = page
    return catalogue,context,resolved

@ensure_csrf_cookie
@require_GET
def bootstrap(request):
    _session(request)
    return JsonResponse({'csrfToken':get_token(request), 'status':'ready', 'engine':'HodHod', 'llmConfigured':bool(settings.LLM_API_KEY), 'provider':settings.LLM_PROVIDER, 'model':settings.LLM_MODEL, 'agentMode':settings.AGENT_MODE, 'catalogue':{'products':Product.objects.count(),'offers':Offer.objects.count()}})

@require_POST
def dispatch(request):
    try:
        if len(request.body)>128000: raise services.ServiceError('درخواست بیش از حد بزرگ است.')
        body=json.loads(request.body)
        if not isinstance(body,dict): raise services.ServiceError('درخواست نامعتبر است.')
        conversation=body.get('sessionId'); request_id=body.get('requestId')
        if not isinstance(conversation,str) or not 1<=len(conversation)<=100 or not isinstance(request_id,str) or not 1<=len(request_id)<=100: raise services.ServiceError('شناسهٔ درخواست نامعتبر است.')
        key=owner(request,conversation); cache_key=(key,request_id)
        with _locks[int(key[:8],16)%len(_locks)]:
            with _cache_lock:
                cached=_replies.get(cache_key)
            if cached and time.monotonic()-cached[0]<600: return JsonResponse(cached[1])
            reply = run(body,key)
            with _cache_lock:
                _replies[cache_key]=(time.monotonic(),reply)
                while len(_replies)>128:_replies.popitem(last=False)
            return JsonResponse(reply)
    except (ValueError,TypeError,services.ServiceError) as exc:
        return JsonResponse({'error':str(exc)},status=400)
    except llm.LLMError as exc:
        return JsonResponse({'error':str(exc),'retryable':True},status=502)

def run(body,key):
    for field in ('action','filters','context'):
        if body.get(field) is not None and not isinstance(body[field],dict):raise services.ServiceError('ساختار درخواست نامعتبر است.')
    if body.get('location') is not None and not isinstance(body['location'],dict):raise services.ServiceError('موقعیت نامعتبر است.')
    if body.get('messages') is not None and not isinstance(body['messages'],list):raise services.ServiceError('ساختار پیام نامعتبر است.')
    action=body.get('action') or {}; kind=action.get('type'); payload=action.get('payload',{})
    if not isinstance(payload,dict):raise services.ServiceError('ساختار اقدام نامعتبر است.')
    location=body.get('location')
    if location:
        lat,lng=services._coords(location.get('lat'),location.get('lon')); location={'lat':lat,'lng':lng}
    raw={}; scene='results'; blocks=[]; text=None; page=body.get('page',0)
    previous=body.get('context') or {}
    if kind=='agent.clarify':
        cid=payload.get('candidateSetId'); result=services.clarify(cid,key,payload.get('field'),payload.get('value'))
        raw={**result,'ranking':services.rank_candidates(result['candidate_set_id'],key,preferences=location,limit=12)['ranking']}
        question=services.ask_clarification(result['candidate_set_id'],key)
        raw['clarification']=question if question.get('question') else None
        text=f"{result['count']} گزینه با انتخاب شما باقی ماند."
        page=0
    elif kind=='message.send':
        messages=[]
        for item in (body.get('messages') or [])[-16:]:
            if not isinstance(item,dict) or item.get('role') not in ('user','assistant') or not isinstance(item.get('text'),str): raise services.ServiceError('ساختار پیام نامعتبر است.')
            messages.append({'role':item['role'],'content':item['text'][:3000]})
        if not messages or messages[-1]['role']!='user': raise services.ServiceError('پیام کاربر دریافت نشد.')
        model_context={}
        if previous.get('candidateSetId'):
            try:
                cs=services._get_set(previous['candidateSetId'],key)
                model_context.update(candidate_set_id=str(cs.id),query=cs.query,filters=cs.filters)
            except services.ServiceError:pass
        visible=previous.get('visibleProductIds',[])
        if isinstance(visible,list):
            model_context['visible_products']=[services._product(p) for p in Product.objects.filter(source_id__in=visible[:12])]
        selected=previous.get('selectedProductId')
        if isinstance(selected,str):
            product=Product.objects.filter(source_id=selected).first()
            if product:model_context['selected_product']=services._product(product)
        raw=llm.chat(messages,key,location,model_context)
        text=raw.get('reply',''); page=0
    else:
        filters=body.get('filters') or {}; query=filters.get('query','')
        cid=previous.get('candidateSetId')
        if cid and previous.get('query')==query:
            try:
                cs=services._get_set(cid,key)
                raw={'candidate_set_id':str(cs.id),'clarification':previous.get('clarification')}
                adjusted=dict(cs.filters)
                for field in ('min_price','max_price','category','provider','price_status','warranty','in_person','lat','lng','radius_km'):adjusted.pop(field,None)
                for field,target in [('min','min_price'),('max','max_price'),('category','category'),('payment','provider'),('priceStatus','price_status')]:
                    if filters.get(field) and filters[field]!='all':adjusted[target]=filters[field]
                if filters.get('warranty'):adjusted['warranty']=True
                if filters.get('inPersonOnly'):adjusted['in_person']=True
                if filters.get('nearby') and location:adjusted.update(lat=location['lat'],lng=location['lng'],radius_km=filters.get('radius',1))
                adjusted=services.validate_filters(adjusted)
                if adjusted!=cs.filters:
                    raw=services.search_products(cs.query,adjusted,key)
                    raw['ranking']=services.rank_candidates(raw['candidate_set_id'],key,preferences=location,limit=12)['ranking']
            except services.ServiceError: cid=None
        else: cid=None
        if not cid:
            script_path=str(settings.BASE_DIR.parent / 'scripts')
            if script_path not in sys.path:sys.path.insert(0,script_path)
            from data_service import connect,query as catalogue_query
            params={k:[str(filters.get(v,''))] for k,v in [('q','query'),('category','category'),('min','min'),('max','max'),('priceStatus','priceStatus')]}
            params['page']=[str(page)]
            if filters.get('nearby') and location:
                params.update(lat=[str(location['lat'])],lon=[str(location['lng'])],radius=[str(filters.get('radius',1))])
            for field in ('shop','bounds','payment'):
                if filters.get(field):params[field]=[str(filters[field])]
            for field,target in [('inPersonOnly','inPerson'),('warranty','warranty')]:
                if filters.get(field):params[target]=['1']
            with connect() as db:catalogue=catalogue_query(db,params)
            block={'id':'products','type':'product_grid' if catalogue['total'] else 'empty_results','props':{'productIds':[p['id'] for p in catalogue['products']]} if catalogue['total'] else {}}
            return make_reply(body,catalogue,{},'results',[block],None)
    catalogue,context,resolved=assemble(raw,key,page)
    context['activity']=[event['name'] for event in raw.get('tool_results',[]) if event.get('name')]
    if len(resolved)>1:
        scene='compare'; blocks=[{'id':'comparison','type':'comparison_workspace','props':{'productIds':resolved[:4]}}]
    elif catalogue['products']:
        blocks=[{'id':'products','type':'product_grid','props':{'productIds':[p['id'] for p in catalogue['products']]}}]
        if len(resolved)==1 and catalogue['offers']:
            blocks.append({'id':'sellers','type':'offer_list','props':{'offerIds':[o['id'] for o in catalogue['offers'][:100]]}})
    else:
        blocks=[{'id':'empty','type':'empty_results','props':{}}]
    ui=raw.get('ui') or {}
    if ui.get('view') in ('compare','sellers'):
        scene='compare';context['compareMode']='sellers' if ui['view']=='sellers' else 'products'
    elif ui.get('view')=='mission':
        scene='mission';blocks=[{'id':'urgent-plan','type':'shopping_mission','props':{'mission':ui['mission']}}]
    elif ui.get('view')=='visit' and catalogue['offers']:
        scene='visit';blocks=[{'id':'visit','type':'visit_summary','props':{'offerIds':[catalogue['offers'][0]['id']]}}];context['selectedOfferId']=catalogue['offers'][0]['id']
    elif ui.get('view')=='map' and catalogue['shops']:
        scene='map'
    # Map/visit intent is grounded in source offers, never fabricated coordinates.
    if kind=='message.send':
        from .matching import norm
        question=norm(payload.get('text',''))
        if any(word in question for word in ('روی نقشه','نقشه نشون','نقشه نشان')) and catalogue['shops']:
            scene='map'; blocks=[{'id':'shops-map','type':'store_map','props':{'shopIds':[s['id'] for s in catalogue['shops'][:100]]}}]
    if raw.get('shopping_plan') and ui.get('view','results')=='results':
        scene='results'
        blocks=[{'id':'shopping-plan','type':'shopping_plan','props':{'offerIds':[o['id'] for o in catalogue['offers'][:100]]}}, {'id':'plan-map','type':'store_map','props':{'shopIds':[s['id'] for s in catalogue['shops'][:100]]}}]
    return make_reply(body,catalogue,context,scene,blocks,text)

def make_reply(body,catalogue,context,scene,blocks,text):
    return {'envelope':{'protocolVersion':1,'kind':'workspace.render','sessionId':body['sessionId'],'requestId':body['requestId'],'scene':scene,'blocks':blocks,'meta':{'source':'dataset','inventoryVerified':False}},'results':catalogue,'text':text,'context':context,'engine':{'name':'HodHod','llmConfigured':bool(settings.LLM_API_KEY),'model':settings.LLM_MODEL,'agentMode':settings.AGENT_MODE}}
