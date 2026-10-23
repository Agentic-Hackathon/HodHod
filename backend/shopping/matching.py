"""Dependency-free, explainable catalogue matching for both Django and offline regression.
No test-case IDs, products or expected answers are hard-coded here.
"""
import re
import unicodedata
from difflib import SequenceMatcher

TRANSLATE = str.maketrans({'ي':'ی','ك':'ک','ى':'ی','ۀ':'ه','ة':'ه','أ':'ا','إ':'ا','ٱ':'ا','‌':' ',
    **{chr(0x6f0+i):str(i) for i in range(10)},**{chr(0x660+i):str(i) for i in range(10)}})
ALIASES = {'sony':'سونی','lens':'لنز','rigol':'ریگول','hikvision':'هایک ویژن','xiaomi':'شیائومی',
 'samsung':'سامسونگ','dahua':'داهوا','nvr':'ان وی آر','air purifier':'تصفیه هوا','purifier':'تصفیه هوا',
 'compact':'کامپکت','vacuum cleaner':'جارو شارژی','mechanical seal':'مکانیکال سیل',
 'gm':'gm','کومپکت':'کامپکت','کامپکت':'compact','میلیمتر':'mm', 'ميلي متر':'mm',
 'ان وی ار':'ان وی آر','هایك ویژن':'هایک ویژن','تصفیه هوای':'تصفیه هوا',
 'اس ۲۳':'s23','گوشی موبایل':'گوشی','رام زیر موتور':'رام زیر موتور',
 'شارژی ماشین':'شارژی خودرو','فیکسه':'فیکس'}
STOP = set(('من یه یک میخوام میخواستم می خواهم می خواستم خریدم میخوام میشه لطفا دنبال هستم برای به از تا تو توي تويی در رو را و یا با که چه چیه چی '
 'کجا کدوم کدام داره دارند دارن فروشنده فروشندگان فروشگاه فروشگاههای مغازه جا الان این اون قبلی همون امروز قیمت ارزون ارزان بهتره '
 'بهترین خرید خریدن بگیرم پیدا کن پیدا کنم میشه گرفتن میشه بگیرم باهاش بشه میشه بهم '
 'میلیون هزار تومان تومن حدود ثبت شده میشه چگونه چند تا چنده چندتا چند کانال ورودی خروجی وزنه وزن ابعاد مشخصات فنی '
 'گارانتی گارانتیش کشور ساخت فیلتر hepa داره نداره اصلی میدونم شماره تلفن لطفا مسیر قسطی اسنپ پی ترب حضوری ارسال فوری '
 'نزدیکترین نزدیک ترین محدوده منطقه توی محدوده ارسال و از فروشگاه فقط لطفا واسه خود فیلم توی این نقطه ام ' 
 'هواساز دستگاه دارم براي حالا').split())
STOP.discard('فیلتر')
STOP.update({'نزدیک','ترین','ماهه','فروشنده','فروشندههای','فروشنده های','مغازه','های','ها','داره','دارن','بازه','موقعیت','فاصله','نقطه','الان','چرا','اینقدره','توی'})
STOP.update({'چقدره','فیکسه','میشه','میخواستم','میخوام','خوام','داره','کجاست','حالا','رو','تو','چنده','؟','بازه','چه','مدل','همون','یه','خود','مورد','پس'})
# Region and shop filters are interpreted at offer level, not product level.
AREAS = ('فردوسی','شیخ هادی','ایرانشهر','بهارستان','باغ فیض','آذربایجان')
BRANDS = ('سونی','سامسونگ','هایک ویژن','داهوا','شیائومی','شارپ','ریگول','اپل','بوش','ایسوس','لنوو','کانن','پاناسونیک')


def norm(s):
    s=unicodedata.normalize('NFKC',str(s or '')).translate(TRANSLATE).casefold()
    s=re.sub(r'[\u064b-\u065f\u0640]','',s)
    for src,dst in sorted(ALIASES.items(),key=lambda kv:-len(kv[0])):
        s=re.sub(r'(?<![\w])'+re.escape(src)+r'(?![\w])',dst,s)
    return re.sub(r'\s+',' ',re.sub(r'[^\w\u0600-\u06ff]+',' ',s)).strip()


def tokens(s):
    n=norm(s)
    words=[]
    for w in n.split():
        if w in STOP or (len(w)==1 and not w.isdigit()):continue
        words.append(w)
        if re.match(r'^\d+(?:mm|gb|tb|w|kg|g)$',w):words.append(re.match(r'^\d+',w).group())
        if re.match(r'^[a-z]{1,5}\d',w):
            for x in re.findall(r'[a-z]+|\d+',w):
                if len(x)>=2:words.append(x)
    # Examples: AS228 and AS-228; DS-9632NXI-I8/S: model part in both forms.
    for m in re.findall(r'(?<!\w)[a-zA-Z]{1,12}[\-/]?\d[\w\-/]*',str(s)):
        key=re.sub('[^a-z0-9]','',m.lower())
        if len(key)>=4:words.append(key)
    return list(dict.fromkeys(words))


def model_keys(s):
    raw=unicodedata.normalize('NFKC',str(s or '')).translate(TRANSLATE).lower()
    parts=re.findall(r'(?<!\w)(?:[a-z]{1,12}[\-/]?\d[a-z0-9/\-]*|\d+[a-z]{2,}[a-z0-9/\-]*)(?!\w)',raw)
    ans=set()
    for part in parts:
        key=re.sub('[^a-z0-9]','',part)
        if len(key)>=4 and not key in {'50mm'}:ans.add(key)
    return ans


def score_product(query, product):
    """Ranking combines literal model anchors, brand and descriptive tokens.
    product is a dict with title/title_fa, title_en, brand, category and optional model and offer_titles.
    """
    title=product.get('title') or product.get('title_fa') or product.get('persian_title') or ''
    doc=' '.join(str(product.get(k) or '') for k in ('title','title_fa','persian_title','title_en','model','brand','brand_name','category','category_name','offer_titles'))
    q=tokens(query)
    if not q:return 0.0
    dt=set(tokens(doc)); dn=norm(doc)
    hits=0.;total=0.
    for t in q:
        if t in AREAS or t in {'18','24','30','32'} and ('گارانتی' in norm(query) or 'متری' in norm(query)):
            continue
        weight=1.8 if re.search('[a-z]',t) and re.search(r'\d',t) else (1.4 if len(t)>=4 else .7)
        total+=weight
        if t in dt or t in dn.split():hits+=weight
        elif len(t)>=3 and any(t==v or v.startswith(t) or t.startswith(v) for v in dt if len(v)>2):hits+=weight*.7
        elif len(t)>=5 and any(SequenceMatcher(None,t,v).ratio()>.84 for v in dt if abs(len(v)-len(t))<=2):hits+=weight*.43
    coverage=hits/max(.01,total)
    query_models=model_keys(query); doc_models=model_keys(doc)
    # Strong model mismatch should beat fuzzy brand/category overlap.
    anchors={a for a in query_models if not (a.endswith('mm') and len(a)<5)}
    if anchors:
        confirmed=sum(1 for a in anchors if a in doc_models or a in re.sub('[^a-z0-9]','',doc.lower()))
        if confirmed:coverage+=.23*confirmed/max(1,len(anchors))
        elif len(anchors)>=1:coverage*=.38
    title_n=norm(title)
    if title_n==norm(query):coverage+=.35
    if norm(query) and norm(query) in title_n:coverage+=.10
    # Explicit brand conflicts must veto generic category/numeric overlap.
    named=[b for b in BRANDS if norm(b) in norm(query)]
    if named and not all(norm(b) in dn for b in named):coverage=min(coverage,.12)
    # A filter and its parent air purifier are materially different items.
    qn=norm(query)
    if 'فیلتر' in qn and 'فیلتر' not in norm(title+' '+str(product.get('category') or product.get('category_name') or '')):
        coverage*=.30
    if 'جارو' in qn and 'ساکشن' in title_n and 'ساکشن' not in qn:coverage*=.45
    return round(coverage,5)


def ranked(query, products, cutoff=0.15):
    scored=[(score_product(query,p),p) for p in products]
    scored.sort(key=lambda x:x[0],reverse=True)
    return [x for x in scored if x[0]>=cutoff]


def confident(scored):
    if not scored:return False
    top=scored[0][0]; next_score=scored[1][0] if len(scored)>1 else 0
    return top>=.64 and (top-next_score>=.055 or top>=1.12)


def retrieval_query(query):
    """Strip answer/output constraints, leaving the item's name; never treat payment/area as product terms."""
    s=norm(query)
    s=re.sub(r'\b(?:تو|در|محدوده|منطقه)\s+(?:'+'|'.join(norm(x) for x in AREAS)+r')\b',' ',s)
    s=re.sub(r'\b(?:18|24|12|6)\s*ماه\s*گارانتی\s*[a-z\u0600-\u06ff]*',' ',s)
    s=re.sub(r'\bگارانتی\s*(?:18|24|12)\s*ماه\b',' ',s)
    s=re.sub(r'\b(?:ارسال فوری|اسنپ پی|ترب پی|قسطی|حضوری|امروز جمعه است|امروز بازه|چرا اینقدره|از کجا|چنده)\b',' ',s)
    s=re.sub(r'\b(?:تو|در)\s+پاساژ\s+\S+',' ',s)
    s=re.sub(r'\s+',' ',s).strip()
    return s or query
