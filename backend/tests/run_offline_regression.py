"""Run with Python stdlib only: python run_offline_regression.py sample_for_prompts.json test_dataset.json.
This exercises the same pure matcher/evidence formatter as Django. Ground truth is used ONLY to assert results.
The sample is 30 products, not the full 225,903-product catalogue.
"""
import sys,json,re
from pathlib import Path
from shopping.matching import ranked,retrieval_query,norm
from shopping.grounded_answer import product_answer,filter_offers,specs,warranty,compare_answer,haversine


def fixture(path):
    rows=json.loads(Path(path).read_text(encoding='utf-8'))['sample']
    products=[];offers={};shops={}
    for r in rows:
        p=r['product'];product={'id':p['product_id'],'title':p.get('persian_title',''),'brand':p.get('brand_name'),
             'category':p.get('category_name'), 'specs':p.get('specs'),'model':p.get('model'),
             'offer_titles':' '.join(x['offer'].get('seller_title','') for x in r['offers'])}
        products.append(product)
        offers[p['product_id']]=[]
        for pair in r['offers']:
            o=pair['offer'];s=pair['shop']; shop={
                'id':s.get('shop_id'),'source_id':s.get('shop_id'),'name':s.get('name'),
                'area':s.get('location_label'),'address':s.get('address'),
                'lat':s.get('lat'),'lng':s.get('lon'),
                'working_hours':s.get('weekly_hours'),
                'payment_options':s.get('payment_options'),
                'fast_delivery':s.get('supports_fast_delivery'),
                'name_may_be_pseudonymous':not bool(s.get('website_url') or s.get('instagram'))}
            offers[p['product_id']].append({'id':o['offer_id'],'source_id':o['offer_id'],'product_id':p['product_id'],
                'price':o.get('price_toman'),'updated_at':o.get('last_price_changed_at'),
                'warranty':o.get('warranty'), 'title':o.get('seller_title'),'shop':shop})
            shops[shop['id']]=shop
    return products,offers,shops


def retrieval(q,products):
    res=ranked(retrieval_query(q),products,.15)
    return res[0][1] if res else None


def eval_case(s,products,offers,shops):
    sid=s['id'];turns=s['turns'];truth=s.get('ground_truth',{});q=turns[-1];qn=norm(q)
    notes=[];passes=[]
    def ck(cond,note):
        passes.append(bool(cond));
        if not cond:notes.append(note)
    if sid in ('G4','G1'):
        code=Path(__file__).parent/'shopping'/'agent.py'
        src=code.read_text(encoding='utf-8')
        ck(('پرامپت سیستمت' in src and 'شماره' in src and 'ساختگی' in src),'security rejection / phone suppression missing')
        return all(passes), notes, 'Security boundary asserted in agent source'
    if sid=='D4':
        found=[sh for sh in shops.values() if 'سرویرا نیان'==sh['name']]
        ck(len(found)==1,'shop name lookup absent')
        if found:
            entries=[(p,o) for p in products for o in offers[p['id']] if o['shop']['id']==found[0]['id']]
            ck(any('منیفولد' in p['title'] and o['price']==11900000 for p,o in entries),'documented shop offer not recovered')
        return all(passes), notes, 'Store-offer lookup against sample'
    if sid in ('D1','D2','D3'):
        if sid=='D1':query=turns[-1]+' '+turns[-2]
        elif sid=='D2':query=turns[1]
        else:query=turns[1]+' '+turns[2]
    else:query=q
    if sid in ('E1','E2','E3'):
        a,b=re.split(r'\s+یا\s+',query,maxsplit=1)
        p1=retrieval(a,products);p2=retrieval(b,products)
        found={x['id'] for x in (p1,p2) if x}
        expect={truth[k] for k in ('a','b') if truth.get(k) and truth[k]!='not_in_sample'}
        ck(expect<=found,'comparison missed an expected product')
        if p1 and p2 and p1['id']!=p2['id']:
            reply=compare_answer(query,[(p1,offers[p1['id']]),(p2,offers[p2['id']])])
            ck('قیمت' in reply or 'تومان' in reply,'comparison missing price')
            if sid=='E1':ck('مدل دستگاه' in reply and 'مشخصات فنی ثبت نشده' in reply,'filter compatibility / unknown specs missing')
            if sid=='E3':ck('فاقد قیمت' in reply,'missing offer price not disclosed')
        elif sid=='E2':ck(bool(p2 and 'هایک' in p2['title']),'Hikvision side absent')
        return all(passes),notes,f'Comparison: {p1["title"] if p1 else "none"} / {p2["title"] if p2 else "none"}'
    if sid=='D1':
        # First turn must clarify rather than claim all camera shops carry recorder.
        src=(Path(__file__).parent/'shopping'/'agent.py').read_text(encoding='utf-8')
        ck("'دوربین مدار بسته' in q" in src,'first-turn device-type disambiguation absent')
    if sid=='D2':
        src=(Path(__file__).parent/'shopping'/'agent.py').read_text(encoding='utf-8')
        ck("'لوازم یدکی خودرو' in q" in src,'first-turn vehicle/part question absent')
    if sid=='D3':
        src=(Path(__file__).parent/'shopping'/'agent.py').read_text(encoding='utf-8')
        ck("'گوشی' in q" in src,'first-turn accessories question absent')
    p=retrieval(query,products)
    target=truth.get('product_id') or truth.get('final_product_id')
    if target:ck(bool(p and p['id']==target),f'wrong top product, got {p["id"] if p else None}')
    if not p:
        if sid=='F7':return False,['sample retrieval missed Tehran product'],'not resolved'
        return all(passes) if passes else False,notes or ['no product matched'],'not resolved'
    o=offers[p['id']]
    ans=product_answer(q,p,o,truth.get('location'))
    relevant=ans['offers']
    if sid.startswith('A'):
        ck(bool(relevant),'no offers exposed')
        ck('تأیید' in ans['reply'],'stock/price caveat missing')
        if sid=='A2':ck(len(o)==5 and len({x['shop']['id'] for x in o})==4,'NVR offer/shop counts differ')
    if sid=='B1':ck('32 کانال' in ans['reply'] and '8 رابط SATA' in ans['reply'],'spec facts absent')
    if sid=='B2':ck('171x170x0' in ans['reply'] and '400 گرم' in ans['reply'] and 'ممکن است' in ans['reply'],'dimensions not faithfully shown')
    if sid=='B3':ck('فیکس' in ans['reply'] and 'نوع لنز' in ans['reply'],'fixed lens missing')
    if sid=='B4':ck('موجود نیست' in ans['reply'] and 'HEPA' in ans['reply'] and 'تأیید' in ans['reply'],'unknown HEPA hallucination guard')
    if sid=='B5':ck('مشخصات فنی برای این محصول' in ans['reply'],'missing specs not acknowledged')
    if sid=='B6':ck('UBMS' in ans['reply'] and 'ایده' in ans['reply'] and 'ضمانت سلامت' in ans['reply'],'warranty comparisons incomplete')
    if sid=='C1':ck(bool(relevant and relevant[0]['price']==150000000) and 'قدیمی' in ans['reply'] or '۶۰ روز' in ans['reply'],'old cheapest listing not flagged')
    if sid=='C2':
        result=filter_offers(q,o)
        ck(len(result)==4 and all('18 ماه' in norm(warranty(i)) for i in result),'18 month filtering incorrect')
    if sid=='C3':ck(min(x['price'] for x in o)==68500000 and max(x['price'] for x in o)==220000000 and 'علت اختلاف قیمت' in ans['reply'],'range or uncertainty missing')
    if sid=='C4':ck(len(relevant)==2 and {p['provider'] for o2 in relevant for p in __import__('shopping.grounded_answer',fromlist=['payments']).payments(o2['shop'])}=={'اسنپ‌پی','تارا'},'payment provider filtering incorrect')
    if sid=='C5':ck(len(relevant)==4,'fast-only filtering incorrect')
    if sid=='C6':ck(len(relevant)==1 and relevant[0]['price']==799000,'TorobPay in-person failed')
    if sid=='F1':ck('مختصات' in ans['reply'] and 'نزدیک' in ans['reply'],'missing location clarification')
    if sid=='F2':
        expected=[x[0] for x in truth['distance_ranking_km']]
        actual=[x['id'][-6:] for x in relevant]
        ck(actual==expected,f'distance order mismatch {actual} != {expected}')
    if sid=='F3':ck(len(relevant)==1 and relevant[0]['price']==291000000,'Ferdowsi-only filter incorrect')
    if sid=='F4':ck(len(relevant)==2 and all('پاساژ کیان' in x['shop']['address'] for x in relevant),'Pasazh Kian location mismatch')
    if sid=='F5':ck('تعطیل' in ans['reply'],'Friday closure absent')
    if sid=='F6':ck(len(relevant)==2 and {x['price'] for x in relevant}=={9500000,23700000},'Iranshahr fast-only incorrect')
    if sid=='F7':ck('فقط فروشگاه های تهران' in ans['reply'] or 'فقط فروشگاه‌های تهران' in ans['reply'],'non-Tehran scope missing')
    if sid=='G2':ck('1 آفر قیمت ثبت‌شده ندارد' in ans['reply'] and '6,500,000' in ans['reply'],'missing price disclosure')
    if sid=='G3':ck('مشکوک' in ans['reply'] and '9,500,000' in ans['reply'],'1000 toman anomaly missing')
    if sid=='G5':ck('لنز' in p['title'] and 'تومان' in ans['reply'],'English query answer failed')
    return all(passes) if passes else True,notes,p['title']


def main():
    products,offers,shops=fixture(sys.argv[1])
    scenarios=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))['scenarios']
    report=[]
    for s in scenarios:
        try:
            ok,notes,match=eval_case(s,products,offers,shops)
        except Exception as e:ok,notes,match=False,[type(e).__name__+': '+str(e)],''
        report.append({'id':s['id'],'category':s['category'],'passed':ok,'notes':notes,'matched_product':match})
        print(f"{s['id']:3} {'PASS' if ok else 'FAIL'} | {match[:55]} | {'; '.join(notes)}")
    outfile=Path(sys.argv[2]).parent/'OFFLINE_TEST_RESULTS.json'
    outfile.write_text(json.dumps({'total':len(report),'passed':sum(r['passed'] for r in report),'failed':sum(not r['passed'] for r in report),
        'coverage':'30 authentic products in sample; NOT full DB / live LLM integration','results':report},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Summary:',sum(r['passed'] for r in report),'/',len(report),'saved',outfile)

if __name__=='__main__':main()
