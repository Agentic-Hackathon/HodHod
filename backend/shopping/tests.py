"""Deterministic fixtures only: integration behavior; NOT accuracy benchmarks on real Torob dataset."""
from decimal import Decimal
import json
from django.test import TestCase,Client,override_settings
from django.utils import timezone
from .models import Shop,Product,Offer
from .normalization import normalize,search_document,parse_simple_request
from . import services


class NormalizerTests(TestCase):
    def test_persian_arabic_and_digit_equivalence(self):
        self.assertEqual(normalize('لپ‌تاپ كیفیت ۱۲'),normalize('لپ تاپ کیفیت 12'))
        self.assertEqual(normalize('گوشي'),normalize('گوشی'))
        intent=parse_simple_request('یه لپ تاپ تا ۳۰ میلیون تومان برای دانشجو')
        self.assertEqual(intent['filters']['max_price'],30000000)
        self.assertIn('لپ تاپ',intent['query'])


class DiscoveryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a=Shop.objects.create(source_id='s1',name='فروشگاه الف',address='تهران، ونک',lat=35.77,lng=51.41,installment=True)
        cls.b=Shop.objects.create(source_id='s2',name='فروشگاه ب',address='تهران، بازار',lat=35.67,lng=51.42,installment=False)
        product_rows=[('p1','لپ تاپ لنوو مدل A', 'لنوو','لپ تاپ'),
                      ('p2','لپ تاپ ایسوس مدل B','ایسوس','لپ تاپ'),
                      ('p3','کیبورد مدل C','متفرقه','کیبورد')]
        cls.p=[]
        for id,title,brand,cat in product_rows:
            p=Product.objects.create(source_id=id,title_fa=title,brand=brand,category=cat,
                                     normalized_title=normalize(title),search_document=search_document({'title_fa':title,'brand':brand,'category':cat}))
            cls.p.append(p)
        now=timezone.now()
        Offer.objects.create(product=cls.p[0],shop=cls.a,price=Decimal('18000000'),price_unit='toman',price_updated_at=now,warranty='۱۲ ماه')
        Offer.objects.create(product=cls.p[0],shop=cls.b,price=Decimal('20000000'),price_unit='toman')
        Offer.objects.create(product=cls.p[1],shop=cls.b,price=Decimal('27000000'),price_unit='toman')
        Offer.objects.create(product=cls.p[2],shop=cls.a,price=Decimal('600000'),price_unit='toman')

    def test_search_and_ranking_real_offer(self):
        r=services.search_products('لپ تاپ',session_key='abc')
        self.assertGreaterEqual(r['count'],2)
        rank=services.rank_candidates(r['candidate_set_id'],'abc')
        self.assertEqual(len(rank['ranking']),2)
        self.assertTrue(all(x['seller_count']>0 for x in rank['ranking']))
        self.assertEqual(services.find_shops_for_product(self.p[0].id)['offers'][0]['price'],18000000)

    def test_session_isolation(self):
        r=services.search_products('لپ تاپ',session_key='sessionA')
        with self.assertRaises(services.ServiceError):
            services.get_facets(r['candidate_set_id'],'sessionB')

    def test_price_and_installment_filter(self):
        r=services.search_products('لپ تاپ',filters={'max_price':19000000,'installment':True},session_key='abc')
        self.assertEqual(r['count'],1)
        self.assertEqual(r['products'][0]['id'],self.p[0].id)

    def test_clarification_applies_filter(self):
        r=services.search_products('لپ تاپ',session_key='abc')
        second=services.clarify(r['candidate_set_id'],'abc','brand','ایسوس')
        self.assertEqual([x['id'] for x in second['products']],[self.p[1].id])

    def test_nearby_requires_real_offer(self):
        r=services.find_nearby_shops(35.77,51.41,2,self.p[0].id)
        self.assertEqual(len(r['shops']),1)
        self.assertEqual(r['shops'][0]['shop']['id'],self.a.id)

    def test_greedy_plan_fewer_stops(self):
        r=services.build_shopping_plan([self.p[0].id,self.p[2].id],lat=35.77,lng=51.41)
        self.assertEqual(len(r['stops']),1)
        self.assertEqual(r['missing_product_ids'],[])
        self.assertFalse(r['exact_route'])

    def test_compare_does_not_claim_inventory(self):
        r=services.find_shops_for_product(self.p[0].id)
        self.assertTrue(all(o['stock_verified'] is False for o in r['offers']))
        self.assertTrue(all('phone' not in o['shop'] for o in r['offers']))

    def test_api_chat_without_key(self):
        with override_settings(LLM_API_KEY=''):
            client=Client()
            response=client.get('/')
            self.assertEqual(response.status_code,200)
            r=client.post('/api/chat/',data=json.dumps({'messages':[{'role':'user','content':'لپ تاپ'}]}),content_type='application/json')
            self.assertEqual(r.status_code,200)
            self.assertGreaterEqual(len(r.json()['ranking']),2)

    def test_http_session_and_csrf_boundaries(self):
        client=Client(enforce_csrf_checks=True)
        self.assertEqual(client.get('/').status_code,200)
        token=client.cookies['csrftoken'].value
        request={'query':'لپ تاپ'}
        r=client.post('/api/tools/search_products/',data=json.dumps(request),
                      content_type='application/json',HTTP_X_CSRFTOKEN=token)
        self.assertEqual(r.status_code,200)
        cid=r.json()['candidate_set_id']
        stranger=Client(enforce_csrf_checks=True)
        stranger.get('/')
        token2=stranger.cookies['csrftoken'].value
        r=stranger.post('/api/tools/get_facets/',data=json.dumps({'candidate_set_id':cid}),
                        content_type='application/json',HTTP_X_CSRFTOKEN=token2)
        self.assertEqual(r.status_code,400)

    def test_bad_tool_args(self):
        client=Client()
        r=client.post('/api/tools/search_products/',data=json.dumps({'query':'لپ تاپ','filters':{'max_price':-9}}),content_type='application/json')
        self.assertEqual(r.status_code,400)

    def test_invalid_geo(self):
        with self.assertRaises(services.ServiceError):
            services.find_nearby_shops(95,51,3)
