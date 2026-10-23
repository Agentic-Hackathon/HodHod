"""Provider-agnostic, bounded LLM tool calling backed ONLY by actual catalogue services."""
import json
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


def chat(messages,session_key,location=None):
    # Grounded search-first orchestration by default; no discretionary LLM clarifying loops.
    if getattr(settings,'AGENT_MODE','grounded') != 'llm':
        return respond(messages,session_key,location)
    if not settings.LLM_API_KEY:
        return respond(messages,session_key,location)
    provider=settings.LLM_PROVIDER.lower()
    if provider not in ('openai','anthropic'):
        raise LLMError('LLM_PROVIDER باید openai یا anthropic باشد.')
    try:
        if provider=='openai':return _openai(messages,session_key,location)
        return _anthropic(messages,session_key,location)
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
    return {'candidate_set_id':last_set,'ranking':ranking,'clarification':question}


def _openai(messages,session_key,location=None):
    from openai import OpenAI
    client=OpenAI(api_key=settings.LLM_API_KEY,base_url=settings.LLM_BASE_URL,timeout=30,max_retries=1)
    location_note=(f'\nمختصات ارائه‌شده توسط کاربر: lat={location["lat"]}, lng={location["lng"]}' if location else '')
    thread=[{'role':'system','content':SYSTEM_PROMPT+location_note},*messages]
    events=[]
    for _ in range(6):
        resp=client.chat.completions.create(model=settings.LLM_MODEL,messages=thread,tools=openai_tools(),tool_choice='auto',temperature=0.2,max_tokens=1000)
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


def _anthropic(messages,session_key,location=None):
    import anthropic
    client=anthropic.Anthropic(api_key=settings.LLM_API_KEY,base_url=settings.LLM_BASE_URL,timeout=30,max_retries=1)
    thread=list(messages); events=[]
    location_note=(f'\nمختصات ارائه‌شده توسط کاربر: lat={location["lat"]}, lng={location["lng"]}' if location else '')
    for _ in range(6):
        response=client.messages.create(model=settings.LLM_MODEL,max_tokens=1100,system=SYSTEM_PROMPT+location_note,
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
