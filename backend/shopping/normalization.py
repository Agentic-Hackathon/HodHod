"""Deterministic Persian/Arabic product query normalization; shared by import, search and tests."""
import re
import unicodedata
import json

_ARABIC = str.maketrans({
    'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ۀ': 'ه', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا',
    '۰':'0', '۱':'1', '۲':'2', '۳':'3', '۴':'4', '۵':'5', '۶':'6', '۷':'7', '۸':'8', '۹':'9',
    '٠':'0', '١':'1', '٢':'2', '٣':'3', '٤':'4', '٥':'5', '٦':'6', '٧':'7', '٨':'8', '٩':'9',
    '‌':' ', 'ـ':' ',
})
_ALIASES = {
    'لپتاپ': 'لپ تاپ', 'لبتاب': 'لپ تاپ', 'گوشی موبایل': 'موبایل',
    'هندزفری بلوتوثی': 'هندزفری', 'هدفون بیسیم': 'هدفون بی سیم',
    'samsung': 'سامسونگ', 'iphone': 'آیفون',
}
_STOP = {'یک', 'یه', 'من', 'خوام', 'حدود', 'بودجه', 'برای', 'میخوام', 'می خواهم', 'میخوام', 'میخواهم', 'لطفا', 'لطفاً', 'بخرم', 'خرید', 'دارید', 'می', 'خواهم', 'خوب', 'بهترین', 'دنبال', 'هستم', 'نیاز', 'دارم', 'که', 'با', 'و', 'از', 'تا'}


def normalize(value):
    value = unicodedata.normalize('NFKC', str(value or '')).translate(_ARABIC).casefold()
    value = ''.join(c for c in value if unicodedata.category(c) != 'Mn')
    value = re.sub(r'[^\w\s\u0600-\u06FF]+', ' ', value)
    value = re.sub(r'\s+', ' ', value).strip()
    for src, dst in _ALIASES.items():
        value = re.sub(r'(?<!\w)' + re.escape(src) + r'(?!\w)', dst, value)
    return re.sub(r'\s+', ' ', value).strip()


def search_terms(query):
    normalized = normalize(query)
    terms = [w for w in normalized.split() if w not in _STOP and len(w) > 1]
    return terms[:8] or normalized.split()[:5]


def search_document(product):
    specs=product.get('specs')
    if isinstance(specs,(dict,list)):
        specs=json.dumps(specs,ensure_ascii=False,default=str)[:1000]
    raw = ' '.join(str(v or '') for v in [product.get('title_fa'), product.get('title_en'), product.get('brand'), product.get('category'), product.get('description','')[:500] if product.get('description') else '', specs or ''])
    from .matching import model_keys
    return (normalize(raw) + ' ' + ' '.join(sorted(model_keys(raw))))[:4000]


def parse_simple_request(text):
    """Small rule-based fallback intent parser, not a substitute for LLM NLU."""
    normalized=normalize(text)
    raw=normalized
    filters={}
    number=r'(\d+(?:[.]\d+)?)'
    budget=re.search(r'(?:تا|زیر|کمتر از|حداکثر|سقف)\s+'+number+r'\s*(میلیون|هزار|تومان)(?:\s+تومان)?',raw)
    if budget:
        factor={'میلیون':1_000_000,'هزار':1_000,'تومان':1}[budget.group(2)]
        filters['max_price']=float(budget.group(1))*factor
        normalized=(normalized[:budget.start()]+' '+normalized[budget.end():]).strip()
    normalized=re.sub(r'^(?:من|یه|یک|برای|می|خوام|میخوام|میخواهم|دنبال|خرید|بهم|لطفا|لطفاً|مناسب|توی|تو)\s+', '', normalized)
    normalized=re.split(r'\s+برای\s+',normalized)[0]
    return {'query':normalized or raw,'filters':filters}


def normalize_price_unit(value):
    v=normalize(value)
    if v in ('toman','tomans','تومان','تومن','irt'):
        return 'toman'
    if v in ('rial','rials','ریال','irr'):
        return 'rial'
    return v or 'unknown'
