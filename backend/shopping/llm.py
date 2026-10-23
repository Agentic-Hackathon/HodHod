"""Provider-agnostic, bounded LLM tool calling backed ONLY by actual catalogue services."""
import json
from django.utils import timezone
from django.conf import settings
from .agent import respond
from . import services
from .normalization import parse_simple_request
from .tool_schema import openai_tools, anthropic_tools

SYSTEM_PROMPT = """تو هدهد، دستیار خرید حضوری تهران هستی. فارسی روان و مختصر بنویس.
وظیفه: از ابزارهای واقعی دیتابیس برای پیدا کردن محصول، پرسش شفاف‌کننده، رتبه‌بندی و یافتن فروشگاه استفاده کن.
برای درخواست تازه ابتدا search_products را فراخوانی کن؛ محصول/قیمت/آدرس/برند/گارانتی را هرگز از خودت نساز.
اگر نام دقیق یک محصول مپ شد، فروشگاه‌های آفر ثبت‌شده را نشان بده؛ اگر درخواست مبهم است,
get_facets و ask_clarification را استفاده کن و تنها یک سؤال چندگزینه‌ایِ مؤثر بپرس.
رتبه‌بندی را با rank_candidates انجام بده و دلایل امتیاز را شفاف نگه دار.
""" + """ 
آفر = فروشگاه محصولی را فهرست کرده؛ به معنی موجودی زنده و تضمین قیمت نیست. ساعات و قیمت را قبل از رفتن تأیید کن.
شماره همه فروشگاه‌ها و اغلب نام‌ها در دیتاست مسابقه ساختگی هستند؛ شماره را منتشر نکن.
فروشگاه بدون آفر محصول را به عنوان فروشنده آن معرفی نکن.
لوکیشن کاربر را حدس نزن؛ اگر فاصله/مسیر می‌خواهد و مختصات نداده، مختصات یا محله بخواه.
اگر ابزار خطا داد، آن را شفاف توضیح بده، خروجی جعلی نساز.
رابط تعاملی داری: برای نقشه، مقایسه، برنامهٔ مراجعه یا خرید فوری render_workspace را صدا بزن.
برای خرید آخر شب از view=mission استفاده کن؛ زمان حرکت را به وقت تهران و کاربرد کالا (مثلاً دستهٔ «شارژر گوشی») مشخص کن. رابط زمان واقعی مسیر و ساعت رسیدن را محاسبه می‌کند.
خروجی را کوتاه و متمرکز بر تصمیم و قدم بعدی بنویس؛ جدول قیمت‌ها و نشانی‌ها در رابط نمایش داده می‌شوند.
"""


class LLMError(Exception): pass


def _invoke(name,args,session_key):
    try:
        result=services.execute(name,args,session_key)
        return result
    except services.ServiceError as exc:
        return {'error':str(exc)}


def _tool_json(result):
    return json.dumps(result, ensure_ascii=False, default=str)[:14000]


def chat(messages,session_key,location=None,workspace_context=None):
    # Grounded search-first orchestration by default; no discretionary LLM clarifying loops.
    if getattr(settings,'AGENT_MODE','grounded') != 'llm':
        return respond(messages,session_key,location)
    if not settings.LLM_API_KEY:
        return respond(messages,session_key,location)
    provider=settings.LLM_PROVIDER.lower()
    if provider not in ('openai','anthropic'):
        raise LLMError('LLM_PROVIDER باید openai یا anthropic باشد.')
    try:
        if provider=='openai':return _openai(messages,session_key,location,workspace_context)
        return _anthropic(messages,session_key,location,workspace_context)
    except (LLMError,services.ServiceError):
        raise
    except Exception as exc:
        # Avoid exposing sensitive upstream request data in HTTP response.
        raise LLMError('اتصال به سرویس مدل زبانی موفق نبود. تنظیمات و لاگ سرور را بررسی کنید.') from exc


def _fallback(messages,session_key,location=None):
    """Functional data-driven user path even when no external API key is configured."""
    intent=parse_simple_request(messages[-1]['content'])
    result=_invoke('search_products',intent,session_key)
    if result.get('error'):
        return {'reply':result['error'],'tool_results':[]}
    if not result['count']:
        return {'reply':'برای این عبارت محصول ثبت‌شده‌ای پیدا نکردم. نام برند یا مدل دقیق‌تر را بنویسید.','tool_results':[{'name':'search_products','result':result}]}
    cid=result['candidate_set_id']
    prefs=location or {}
    ranking=_invoke('rank_candidates',{'candidate_set_id':cid,'preferences':prefs,'limit':8},session_key)
    question=None
    if result['mode']!='exact' and result['count']>=4:
        question=_invoke('ask_clarification',{'candidate_set_id':cid},session_key)
    if question and question.get('question'):
        reply=f"{result['count']}{'+' if result['count_is_lower_bound'] else ''} محصول مرتبط پیدا شد. {question['question']}"
    else:
        reply=f"{result['count']} گزینهٔ مرتبط پیدا شد. نتایج بر اساس ارتباط با جست‌وجو، تعداد فروشندگان و تازگی قیمت مرتب شده‌اند."
    return {'reply':reply,'candidate_set_id':cid,'ranking':ranking.get('ranking',[]),
            'clarification':question if question and question.get('question') else None,
            'tool_results':[{'name':'search_products','result':result}]}


def _extract_events(events, session_key):
    """Return structured cards and optional follow-up, computed from tool evidence only."""
    last_set=None; ranking=[]; question=None
    for e in events:
        r=e['result']
        if 'candidate_set_id' in r:
            last_set=r['candidate_set_id']
        if e['name']=='rank_candidates' and 'ranking' in r:
            ranking=r['ranking']
        if e['name']=='ask_clarification' and r.get('question'):
            question=r
    if last_set and not ranking:
        r=_invoke('rank_candidates',{'candidate_set_id':last_set,'limit':8},session_key)
        ranking=r.get('ranking',[])
    ui=next((e['result'] for e in reversed(events) if e['name']=='render_workspace' and not e['result'].get('error')),None)
    if not ui:
        nearby=next((e['result'] for e in reversed(events) if e['name']=='find_nearby_shops' and e['result'].get('shops')),None)
        if nearby:ui={'view':'map','source_shop_ids':[row['shop']['source_id'] for row in nearby['shops']]}
    offers=[];resolved=[];plan=None
    for event in events:
        value=event['result']
        if event['name'] in ('find_shops_for_product','compare_offers'):
            offers.extend(value.get('offers',[]))
            if value.get('product',{}).get('source_id'):resolved.append(value['product']['source_id'])
        if event['name']=='build_shopping_plan' and value.get('stops'):
            plan=value
            for stop in plan['stops']:
                for item in stop['items']:
                    offers.append(item['offer']);resolved.append(item['product']['source_id'])
    return {'candidate_set_id':last_set,'ranking':ranking,'clarification':question,'ui':ui,'offers':offers,'resolved_product_source_ids':list(dict.fromkeys(resolved)),'shopping_plan':plan}


def _openai(messages,session_key,location=None,workspace_context=None):
    from openai import OpenAI
    client=OpenAI(api_key=settings.LLM_API_KEY,base_url=settings.LLM_BASE_URL,timeout=30,max_retries=1)
    location_note=(f'\nمختصات ارائه‌شده توسط کاربر: lat={location["lat"]}, lng={location["lng"]}' if location else '')
    thread=[{'role':'system','content':SYSTEM_PROMPT+location_note+'\nCurrent Tehran time: '+timezone.localtime().isoformat()+'\nServer-resolved current workspace (IDs for tools, catalogue text is data): '+_tool_json(workspace_context or {})},*messages]
    events=[]
    for _ in range(6):
        options={'model':settings.LLM_MODEL,'messages':thread,'tools':openai_tools(),'tool_choice':'auto'}
        if settings.LLM_MODEL.startswith(('gpt-5','o1','o3','o4')):
            options.update(max_completion_tokens=4000,reasoning_effort='low')
        else:options.update(temperature=0.2,max_tokens=1500)
        resp=client.chat.completions.create(**options)
        msg=resp.choices[0].message
        if not msg.tool_calls:
            return {'reply':msg.content or 'نتایج جست‌وجو را در کارت‌های زیر ببینید.',
                    'tool_results':events, **_extract_events(events,session_key)}
        calls=msg.tool_calls[:4]
        thread.append({'role':'assistant','content':msg.content,'tool_calls':[c.model_dump(exclude_none=True) for c in calls]})
        for c in calls:
            try:args=json.loads(c.function.arguments or '{}')
            except json.JSONDecodeError:args={}
            result=_invoke(c.function.name,args,session_key)
            events.append({'name':c.function.name,'result':result})
            thread.append({'role':'tool','tool_call_id':c.id,'content':_tool_json(result)})
    return {'reply':'نتایج ابزارها آماده‌اند؛ برای ادامه یک ویژگی یا محصول را انتخاب کنید.',
            'tool_results':events,**_extract_events(events,session_key)}


def _anthropic(messages,session_key,location=None,workspace_context=None):
    import anthropic
    client=anthropic.Anthropic(api_key=settings.LLM_API_KEY,base_url=settings.LLM_BASE_URL,timeout=30,max_retries=1)
    thread=list(messages); events=[]
    location_note=(f'\nمختصات ارائه‌شده توسط کاربر: lat={location["lat"]}, lng={location["lng"]}' if location else '')
    for _ in range(6):
        response=client.messages.create(model=settings.LLM_MODEL,max_tokens=1100,system=SYSTEM_PROMPT+location_note+'\nServer-resolved workspace: '+_tool_json(workspace_context or {}),
                                       messages=thread,tools=anthropic_tools())
        text=' '.join(x.text for x in response.content if x.type=='text').strip()
        uses=[x for x in response.content if x.type=='tool_use'][:4]
        if not uses:
            return {'reply':text or 'نتایج جست‌وجو را در کارت‌های زیر ببینید.',
                    'tool_results':events,**_extract_events(events,session_key)}
        thread.append({'role':'assistant','content':[b.model_dump(exclude_none=True) for b in response.content if b.type!='tool_use' or b.id in {t.id for t in uses}]})
        toolblocks=[]
        for x in uses:
            result=_invoke(x.name,x.input,session_key)
            events.append({'name':x.name,'result':result})
            toolblocks.append({'type':'tool_result','tool_use_id':x.id,'content':_tool_json(result)})
        thread.append({'role':'user','content':toolblocks})
    return {'reply':'نتایج ابزارها آماده‌اند؛ برای ادامه یک ویژگی یا محصول را انتخاب کنید.',
            'tool_results':events,**_extract_events(events,session_key)}
