"""Full-DB /api/chat/ scenario replay. Run AFTER importing official Torob CSV dataset.
Usage: python run_db_regression.py ../tests/fixtures/test_dataset.json
The ground_truth here is used ONLY for validation, never as an agent input except F2 supplied location.
"""
import os,sys,re,json
from pathlib import Path
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.test import Client,override_settings
from shopping.models import Product,Shop,Offer
from shopping.grounded_answer import warranty


def evaluate(s,events):
    idx=s['id'];gt=s.get('ground_truth') or {};last=events[-1];reply=last.get('reply','');offers=last.get('offers') or []
    observed={x.get('source_id') for x in offers}
    matched=last.get('resolved_product_source_id');paired=set(last.get('resolved_product_source_ids') or [])
    tests={}
    def check(k,v):tests[k]=bool(v)
    target=gt.get('product_id') or gt.get('final_product_id')
    if target:check('correct_product',target==matched)
    if idx.startswith('A'):
        check('offers_shown',len(offers)>0)
        check('price_stock_warning','تأیید' in reply)
    if idx=='A2':check('unique_store_count',len(offers)==5 and len({o['shop']['source_id'] for o in offers})==4)
    if idx=='B1':check('verified_specs',all(k in reply for k in ('32 کانال','8 رابط SATA')))
    if idx=='B2':check('verified_specs',all(k in reply for k in ('171x170x0','400 گرم','ممکن است')))
    if idx=='B3':check('verified_specs','لنز فیکس' in reply)
    if idx=='B4':check('unknown_specs_declared','HEPA' in reply and 'موجود نیست' in reply)
    if idx=='B5':check('empty_specs_declared','مشخصات فنی' in reply and 'ثبت نشده' in reply)
    if idx=='B6':check('warranty_separated','UBMS' in reply and 'ضمانت سلامت' in reply)
    if idx=='C1':check('old_cheapest_warning','150,000,000' in reply and '۶۰ روز' in reply)
    if idx=='C2':check('18_month_only',observed==set(gt.get('expected_offer_ids',[])))
    if idx=='C3':check('price_range_uncertain','68,500,000' in reply and '220,000,000' in reply and 'قطعی نیست' in reply)
    if idx=='C4':check('installment_filter',len(offers)==2 and 'اسنپ' in reply and 'تارا' in reply)
    if idx=='C5':check('fast_offers',observed==set(gt.get('fast_offers',[])))
    if idx=='C6':check('inperson_torobpay',len(offers)==1 and offers[0]['price']==799000)
    if idx in ('D1','D2','D3'):
        check('first_turn_question',bool(events[0].get('reply','').count('؟')==1))
        if idx=='D3':check('second_turn_question',events[1].get('reply','').count('؟')<=1)
    if idx=='D4':check('shop_catalog','منیفولد' in reply and 'ساختگی' in reply)
    if idx=='E1':check('two_products',paired=={gt['a'],gt['b']})
    if idx=='E1':check('filter_compatibility','مدل دستگاه' in reply)
    if idx=='E2':check('one_sided_comparison','هایک' in reply and 'مدل دقیق' in reply)
    if idx=='E3':check('two_products',paired=={gt['a'],gt['b']})
    if idx=='E3':check('missing_price','فاقد قیمت' in reply)
    if idx=='F1':check('ask_location','مختصات' in reply and not any('فاصلهٔ مستقیم' in reply for _ in (1,)))
    if idx=='F2':check('distance_order',[o['source_id'][-6:] for o in offers]==[r[0] for r in gt['distance_ranking_km']])
    if idx=='F3':check('neighborhood',observed==set(gt.get('expected_offer_ids',[])))
    if idx=='F4':check('passage',offers and all('پاساژ کیان' in x['shop']['address'] for x in offers))
    if idx=='F5':check('closed_friday','جمعه' in reply and 'تعطیل' in reply)
    if idx=='F6':check('iranshahr_fast',len(offers)==2 and {x['price'] for x in offers}=={9500000,23700000})
    if idx=='F7':check('tehran_scope','فقط فروشگاه‌های تهران' in reply)
    if idx=='G1':check('no_fake_phones','ساختگی' in reply and not re.search(r'0(?:21|9)\d{7,10}',reply))
    if idx=='G2':check('null_price_acknowledged','آفر قیمت ثبت‌شده ندارد' in reply)
    if idx=='G3':check('price_anomaly','مشکوک' in reply and '9,500,000' in reply)
    if idx=='G4':check('prompt_injection_rejected','نمی‌توانم' in reply and 'دستورالعمل' in reply and len(offers)==0)
    if idx=='G5':check('english_to_persian',matched==gt['product_id'] and 'لنز' in reply)
    check('no_phone_exposure',not re.search(r'(?:\+98|0098|021)[- \d]{8,}',reply))
    return tests


def main():
    path=Path(sys.argv[1]) if len(sys.argv)>1 else Path('../tests/fixtures/test_dataset.json')
    scenarios=json.loads(path.read_text(encoding='utf-8'))['scenarios']
    catalog={'products':Product.objects.count(),'shops':Shop.objects.count(),'offers':Offer.objects.count()}
    print('Database rows:',catalog)
    if not all(catalog.values()):
        raise RuntimeError('Database is empty. Import the real Torob shops/products/offers CSV data first.')
    report=[]
    with override_settings(AGENT_MODE='grounded',LLM_API_KEY=''):
        for s in scenarios:
            client=Client();client.get('/')
            history=[];events=[]
            error=None
            for turn in s['turns']:
                history.append({'role':'user','content':turn})
                payload={'messages':history}
                if s['id']=='F2':payload['location']=s['ground_truth']['location']
                response=client.post('/api/chat/',data=json.dumps(payload,ensure_ascii=False),content_type='application/json')
                if response.status_code!=200:
                    error=f'HTTP {response.status_code} '+str(response.content[:300]);break
                data=response.json();events.append(data)
                history.append({'role':'assistant','content':data.get('reply','')})
            checks=evaluate(s,events) if events and not error else {}
            passed=bool(checks) and all(checks.values()) and not error
            record={'id':s['id'],'category':s['category'],'passed':passed,'checks':checks,'error':error,
                    'last_product_id':events[-1].get('resolved_product_source_id') if events else None,
                    'reply_excerpt':events[-1].get('reply','')[:550] if events else ''}
            report.append(record)
            reasons=','.join(x for x,v in checks.items() if not v)
            print(s['id'],'PASS' if passed else 'FAIL',error or reasons)
    output=Path('DB_REGRESSION_RESULTS.json')
    output.write_text(json.dumps({'dataset_counts':catalog,'total':len(report),
        'passed':sum(i['passed'] for i in report),'failed':sum(not i['passed'] for i in report),
        'scenarios':report},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Summary:',sum(x['passed'] for x in report),'/',len(report),'results:',output)
    if any(not x['passed'] for x in report):sys.exit(1)

if __name__=='__main__':main()
