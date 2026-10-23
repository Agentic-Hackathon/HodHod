import json
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from . import llm, services
from .models import Offer, Product, Shop

MAX_HISTORY=16
MAX_CHARS=1600
MAX_BODY=20000


def _session(request):
    if not request.session.session_key:
        request.session['hodhod_initialized']=True
        request.session.save()
    return request.session.session_key


def _body(request):
    if len(request.body)>MAX_BODY:
        raise services.ServiceError('درخواست بیش از حد بزرگ است.')
    try: payload=json.loads(request.body)
    except (ValueError,TypeError): raise services.ServiceError('JSON نامعتبر است.')
    if not isinstance(payload,dict): raise services.ServiceError('ورودی باید یک شیء JSON باشد.')
    return payload


def _error(exc):
    return JsonResponse({'error':str(exc)},status=400)


@ensure_csrf_cookie
@require_GET
def index(request):
    _session(request)
    return render(request,'shopping/chat.html')


@require_POST
def chat(request):
    try:
        payload=_body(request)
        raw=payload.get('messages')
        if not isinstance(raw,list) or len(raw)>MAX_HISTORY+4:
            raise services.ServiceError('فهرست پیام‌ها نامعتبر است.')
        messages=[]
        for m in raw[-MAX_HISTORY:]:
            if not isinstance(m,dict) or m.get('role') not in ('user','assistant') or not isinstance(m.get('content'),str):
                raise services.ServiceError('ساختار یا نقش پیام نامعتبر است.')
            content=m['content'].strip()[:MAX_CHARS]
            if content:messages.append({'role':m['role'],'content':content})
        if not messages or messages[-1]['role']!='user':
            raise services.ServiceError('آخرین پیام باید از کاربر باشد.')
        location=payload.get('location')
        if location is not None:
            if not isinstance(location,dict):
                raise services.ServiceError('فرمت موقعیت نامعتبر است.')
            lat,lng=services._coords(location.get('lat'),location.get('lng'))
            location={'lat':lat,'lng':lng}
        return JsonResponse(llm.chat(messages,_session(request),location))
    except services.ServiceError as exc:return _error(exc)
    except llm.LLMError as exc:return JsonResponse({'error':str(exc)},status=502)


@require_POST
def tool(request, name):
    try:
        body=_body(request)
        result=services.execute(name,body,_session(request))
        return JsonResponse(result)
    except services.ServiceError as exc:return _error(exc)


@require_POST
def clarify(request):
    try:
        data=_body(request)
        result=services.clarify(data.get('candidate_set_id'),_session(request),data.get('field'),data.get('value'))
        ranked=services.rank_candidates(result['candidate_set_id'],_session(request),limit=8)
        question=services.ask_clarification(result['candidate_set_id'],_session(request)) if result['count']>3 else None
        return JsonResponse({'reply':f"{result['count']} گزینه پس از اعمال فیلتر باقی ماند.",
                             'candidate_set_id':result['candidate_set_id'],
                             'ranking':ranked['ranking'],'clarification':question if question and question.get('question') else None})
    except services.ServiceError as exc:return _error(exc)


@require_GET
def offers(request, product_id):
    try:return JsonResponse(services.find_shops_for_product(product_id))
    except services.ServiceError as exc:return _error(exc)


@require_GET
def stats(request):
    return JsonResponse({'shops':Shop.objects.count(),'products':Product.objects.count(),'offers':Offer.objects.count(),
                         'dataset_warning':'نام و شماره اکثر فروشگاه‌ها در دیتاست چالش ساختگی است.'})
