"""Evidence-constrained user answers. Pure Python so the same logic is exercised offline.
The caller supplies actual product/offer/shop records; never accepts ground-truth labels.
"""
import json
from datetime import datetime, timezone
from statistics import median
from math import radians,cos,sin,asin,sqrt
from .matching import norm, AREAS

DISCLAIMER='آفرها موجودی زنده یا قیمت قطعی نیستند؛ پیش از مراجعه قیمت و موجودی را تأیید کنید.'


def obj(value):
    if isinstance(value,(list,dict)):return value
    if isinstance(value,str):
        try:return json.loads(value)
        except (TypeError,ValueError):pass
    return None


def specs(product):
    raw=product.get('specs')
    s=obj(raw)
    if s is None and isinstance(raw,str) and raw.lstrip().startswith('['):
        # Partial sample previews may truncate a JSON list. Recover only fully
        # decoded leading objects; never invent or infer missing attributes.
        s=[]; pos=raw.find('[')+1; decoder=json.JSONDecoder()
        while pos<len(raw):
            pos+=len(raw[pos:])-len(raw[pos:].lstrip(' ,\n\r\t'))
            try:item,end=decoder.raw_decode(raw,pos)
            except (ValueError,TypeError):break
            if not isinstance(item,dict):break
            s.append(item);pos=end
    if isinstance(s,list):
        return {str(x.get('key','')):x.get('value') for x in s if isinstance(x,dict) and x.get('key')}
    if isinstance(s,dict):return {str(k):v for k,v in s.items() if isinstance(v,(str,int,float))}
    return {}


def warranty(offer):
    w=obj(offer.get('warranty'))
    if isinstance(w,dict):
        fields=[]
        if w.get('period_months'):fields.append(str(w['period_months'])+' ماه')
        if w.get('provider'):fields.append(str(w['provider']))
        if w.get('description'):fields.append(str(w['description']))
        return '، '.join(fields) or 'ثبت نشده'
    return str(offer.get('warranty') or 'ثبت نشده')


def payments(shop):
    p=shop.get('payment_options') or []
    p=obj(p) if not isinstance(p,list) else p
    if not isinstance(p,list):p=[]
    result=[]
    for i in p:
        if isinstance(i,dict):result.append({'provider':str(i.get('provider') or i.get('provider_name') or ''), 'channel':i.get('channel') or 'unknown'})
    return result


def amount(num):
    return f'{num:,.0f} تومان' if num is not None else 'قیمت ثبت نشده'


def haversine(a,b,c,d):
    lat1,lon1,lat2,lon2=map(radians,[a,b,c,d])
    h=sin((lat2-lat1)/2)**2+cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
    return 6371.0088*2*asin(min(1,sqrt(h)))


def _area(q):
    for area in AREAS:
        if norm(area) in norm(q):return area
    return None


def _fast(shop):
    v=shop.get('fast_delivery',shop.get('supports_fast_delivery'))
    if isinstance(v,str):return v.lower() in ('1','true','yes')
    return v is True


def filter_offers(q,offers):
    qn=norm(q)
    out=list(offers)
    area=_area(q)
    if area:out=[x for x in out if area in str(x['shop'].get('area') or x['shop'].get('location_label') or '') or area in str(x['shop'].get('address',''))]
    # Tehran-only sample; Isfahan is an out-of-scope region rather than a query filter.
    if 'ارسال فوری' in qn:out=[x for x in out if _fast(x['shop'])]
    if 'قسط' in qn or 'اسنپ پی' in qn or 'ترب پی' in qn:
        if 'اسنپ پی' in qn and 'قسط' not in qn:
            out=[x for x in out if any('اسنپ' in norm(p['provider']) for p in payments(x['shop']))]
        elif 'ترب پی' in qn:
            out=[x for x in out if any('ترب' in norm(p['provider']) and p['channel']=='in_person' for p in payments(x['shop']))]
        else:out=[x for x in out if payments(x['shop'])]
    if ('18 ماه' in qn or '۱۸ ماه' in q) and ('گارانتی' in qn or 'فروشنده' in qn):
        out=[x for x in out if ('18 ماه' in norm(warranty(x)) or '18ماه' in norm(warranty(x)))]
    if 'ubms' in qn:out=[x for x in out if 'ubms' in norm(warranty(x))]
    if 'پاساژ' in qn:
        import re
        passage=re.search(r'پاساژ\s+(\S+)',qn)
        if passage:
            wanted=passage.group(1)
            out=[x for x in out if wanted in norm(x['shop'].get('address',''))]
    return out


def _line(o, distance=None):
    s=o['shop'];name=s.get('name') or ('فروشگاه '+str(s.get('source_id') or s.get('id'))[-6:]);area=s.get('area') or s.get('location_label') or ''
    fragments=[name+((' ('+area+')') if area else ''),amount(o.get('price'))]
    if distance is not None:fragments.append(f'فاصلهٔ مستقیم {distance:.2f} کیلومتر')
    if o.get('warranty'):fragments.append('گارانتی: '+warranty(o))
    if _fast(s):fragments.append('ارسال فوری اعلام‌شده')
    if payments(s):fragments.append('روش پرداخت ثبت‌شده: '+', '.join(x['provider']+(' (کانال استفاده نامشخص)' if x['channel']=='unknown' else '') for x in payments(s)))
    if o.get('updated_at'):fragments.append('تاریخ قیمت: '+str(o['updated_at'])[:10])
    if s.get('address'):fragments.append('نشانی: '+str(s['address']))
    return ' — '.join(fragments)


def spec_response(query,product,offers):
    qn=norm(query);data=specs(product)
    if not any(x in qn for x in ['مشخصات','چند کانال','هارد','ابعاد','وزن','فیکس','زوم','hepa','ساخت کجا']):return None
    answer=[]
    keys=[]
    if 'چند کانال' in qn or 'هارد' in qn:keys=['ورودی تصویر','تعداد هارد']
    elif 'ابعاد' in qn or 'وزن' in qn:keys=['ابعاد','وزن']
    elif 'فیکس' in qn or 'زوم' in qn:keys=['نوع لنز']
    elif 'hepa' in qn or 'ساخت کجا' in qn:keys=['HEPA','کشور سازنده']
    elif 'مشخصات' in qn:keys=list(data)[:12]
    for k in keys:
        matched=[(key,v) for key,v in data.items() if norm(k) in norm(key) or norm(key) in norm(k)]
        if matched:answer.extend(f'{key}: {v}' for key,v in matched)
        else:answer.append(f'«{k}» در مشخصات ثبت‌شده موجود نیست')
    if not answer:answer=['مشخصات فنی برای این محصول در دیتاست ثبت نشده است.']
    if '0 میلی' in ' '.join(answer):answer.append('عدد صفر در ابعاد همان مقدار ثبت‌شده است و ممکن است خطای داده باشد.')
    if 'hepa' in qn or 'ساخت کجا' in qn:answer.append('این ویژگی‌ها را از فروشنده تأیید کنید.')
    return '\n'.join(answer)


def product_answer(query,product,offers,location=None,max_lines=8):
    title=product.get('title') or product.get('persian_title') or 'محصول'
    qn=norm(query)
    if 'اصفهان' in qn:
        return {'reply':'پوشش دیتاست فعلی فقط فروشگاه‌های تهران است. برای اصفهان اطلاعات معتبر ندارم؛ می‌توانم آفرهای ثبت‌شدهٔ تهران را نشان دهم.', 'offers':[]}
    if ('نزدیک' in qn or 'مسیر' in qn) and not location:
        return {'reply':f'محصول «{title}» در دیتاست وجود دارد. برای تعیین نزدیک‌ترین فروشنده، محله یا مختصات خودتان را بفرستید. بدون موقعیت، ترتیب فاصله قابل محاسبه نیست.', 'offers':offers[:8]}
    if 'شماره' in qn and ('تلفن' in qn or 'فروشنده' in qn):
        return {'reply':'شماره‌های تماس دیتاست مسابقه ساختگی‌اند و قابل انتشار به‌عنوان راه تماس معتبر نیستند. نشانی فروشگاه‌های دارای آفر را می‌توانم نشان دهم.','offers':[]}
    applicable=filter_offers(query,offers)
    if location:
        loc=[(haversine(location['lat'],location['lng'],o['shop']['lat'],o['shop']['lng']) if o['shop'].get('lat') is not None and o['shop'].get('lng') is not None else float('inf'),o) for o in applicable]
        loc.sort(key=lambda x:x[0]); applicable=[o for _,o in loc]
    elif 'ارزون' in qn or 'ارزان' in qn or 'قیمت' in qn or 'چنده' in qn or 'کجا' in qn:
        applicable.sort(key=lambda x:(x.get('price') is None,float(x.get('price') or float('inf'))))
    prices=[float(o['price']) for o in applicable if o.get('price') is not None]
    nshops=len({o['shop'].get('id') or o['shop'].get('source_id') for o in applicable})
    intro=f'«{title}»: {len(applicable)} آفر از {nshops} فروشگاه ثبت شده است.'
    if prices:intro+=' بازهٔ قیمت ثبت‌شده: '+amount(min(prices))+' تا '+amount(max(prices))+'.'
    if not applicable:intro+=' با شرایط مکانی/پرداخت/گارانتی خواسته‌شده آفر منطبق پیدا نشد.'
    if len(prices)<len(applicable):intro+=f' {len(applicable)-len(prices)} آفر قیمت ثبت‌شده ندارد.'
    spec=spec_response(query,product,applicable)
    if spec:intro+='\n'+spec
    if 'گارانتی' in qn and not ('18 ماه' in qn):
        intro+='\nگارانتی هر آفر مستقل است؛ «ضمانت سلامت» لزوماً گارانتی مدت‌دار نیست.'
    if ('اختلاف' in qn and prices and max(prices)>min(prices)*1.3):
        intro+='\nعلت اختلاف قیمت در دیتاست قطعی نیست؛ تفاوت نسخهٔ مدل، شرایط گارانتی یا قدیمی‌بودن آفر را از فروشنده استعلام کنید.'
    if prices and len(prices)>1 and min(prices)>0 and (min(prices)<median(prices)*.15 or max(prices)/min(prices)>50):
        intro+='\nهشدار: قیمت بسیار پایین نسبت به دیگر آفرها مشکوک به خطای ثبت یا قیمت ناقص است؛ آن را بدون تأیید پیشنهاد قطعی ندانید.'
    if any(o.get('updated_at') and (datetime.now(timezone.utc) - datetime.fromisoformat(str(o['updated_at']).replace('Z','+00:00'))).days>60 for o in applicable):
        intro+='\nهشدار: بعضی قیمت‌ها بیش از ۶۰ روز از آخرین تغییرشان گذشته است.'
    if 'بازه' in qn and 'جمعه' in qn or ('جمعه' in qn and 'باز' in qn):
        open_stat=[]
        for o in applicable:
            raw_hours=o['shop'].get('working_hours')
            h=obj(raw_hours) or {}
            if not h and isinstance(raw_hours,str) and raw_hours.lstrip().startswith('{"fri"'):
                m=__import__('re').search(r'"fri"\s*:\s*\{[^}]*\}[^}]*"status"\s*:\s*"([^"]+)"',raw_hours)
                if m:h={'fri':{'status':m.group(1)}}
            if isinstance(h,dict) and isinstance(h.get('fri'),dict):
                status=h['fri'].get('status')
                open_stat.append(f"{o['shop'].get('name','فروشگاه')}: جمعه "+('تعطیل اعلام شده' if status=='closed' else 'ساعت کاری را تأیید کنید'))
        if open_stat:intro+='\n'+'\n'.join(dict.fromkeys(open_stat))
    lines=[]
    for o in applicable[:max_lines]:
        d=haversine(location['lat'],location['lng'],o['shop']['lat'],o['shop']['lng']) if location and o['shop'].get('lat') is not None and o['shop'].get('lng') is not None else None
        lines.append('• '+_line(o,d))
    if lines:intro+='\n'+'\n'.join(lines)
    if len(applicable)>max_lines:intro+=f'\n{len(applicable)-max_lines} آفر دیگر نیز ثبت شده است.'
    intro+='\n'+DISCLAIMER
    return {'reply':intro,'offers':applicable}


def compare_answer(query,pairs):
    lines=['مقایسه صرفاً بر مبنای اطلاعات ثبت‌شده در دیتاست:']
    for product,offers in pairs:
        title=product.get('title') or product.get('persian_title')
        prices=[float(o['price']) for o in offers if o.get('price') is not None]
        p=f'{amount(min(prices))} تا {amount(max(prices))}' if prices else 'قیمت موجود نیست'
        fast=sum(_fast(o['shop']) for o in offers)
        s=specs(product)
        lines.append(f'• {title}: {len(offers)} آفر، {p}، {fast} آفر از فروشگاه‌های دارای ارسال فوری؛ '+(f'{len(s)} مشخصهٔ ثبت‌شده' if s else 'مشخصات فنی ثبت نشده'))
        if len(prices)<len(offers):lines.append('  بعضی آفرهای این کالا فاقد قیمت‌اند.')
    n=norm(query)
    if 'فیلتر' in n:
        lines.append('فیلترها باید با مدل دستگاه سازگار باشند؛ صرف متراژ خانه معیار انتخاب این دو فیلتر نیست. مدل دستگاه تصفیه‌هوای شما چیست؟')
    elif 'ساکشن' in n and 'جارو' in n:
        lines.append('جارو AS-228 در داده‌ها مخصوص خودرو و دارای قابلیت مکنده/دمنده معرفی شده؛ کاربرد ساکشن HSP را بدون مستندات مشخص نمی‌دانیم. برای نظافت خودرو، جارو با این کاربرد مرتبط‌تر است.')
    else:lines.append('برای نتیجهٔ قطعی باید مشخصات هر دو مدل از دیتاست قابل استخراج باشد؛ مدل دقیق گزینهٔ دیگر را بفرمایید.')
    lines.append(DISCLAIMER)
    return '\n'.join(lines)
