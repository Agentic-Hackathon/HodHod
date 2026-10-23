"""Real catalogue + real Django bridge, with deterministic orchestration and mocked UI intents.
No upstream model is used by this repeatable regression test.
"""
import json
import hashlib
import os
import sqlite3
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.workspace_settings')
import django
django.setup()
from django.test import Client,override_settings
from shopping import services
from shopping.models import CandidateSet,Product,Offer

def main():
    c=Client(enforce_csrf_checks=True,HTTP_HOST='127.0.0.1')
    token=c.get('/api/workspace/bootstrap/').json()['csrfToken']
    conversation='regression-'+uuid.uuid4().hex
    owner_key=hashlib.sha256((c.session.session_key+':'+conversation).encode()).hexdigest()
    def send(body,status=200):
        payload={'sessionId':conversation,'requestId':uuid.uuid4().hex,'page':0,**body}
        r=c.post('/api/workspace/dispatch/',data=json.dumps(payload),content_type='application/json',HTTP_X_CSRFTOKEN=token)
        assert r.status_code==status,(r.status_code,r.content[:300])
        return r.json()
    try:
        with override_settings(AGENT_MODE='grounded'):
            first=send({'action':{'type':'message.send'},'messages':[{'role':'user','text':'هدفون سونی میخوام'}]})
        assert first['context']['count']>12
        cid=first['context']['candidateSetId']
        with sqlite3.connect(ROOT/'.local'/'torob.sqlite') as db:
            for table in ('products','offers','shops'):
                for entity in first['results'][table]:
                    original=json.loads(db.execute(f'SELECT payload FROM {table} WHERE id=?',(entity['id'],)).fetchone()[0])
                    assert entity==original,entity['id']
        question=first['context']['clarification']
        clarified=send({'action':{'type':'agent.clarify','payload':{'candidateSetId':cid,'field':question['field'],'value':question['options'][0]['value']}}})
        assert clarified['context']['count']<=first['context']['count']
        paged=send({'action':{'type':'catalog.browse'},'context':first['context'],'filters':{'query':first['context']['query']},'page':1})
        assert not ({p['id'] for p in first['results']['products']}&{p['id'] for p in paged['results']['products']})
        cheaper=send({'action':{'type':'catalog.browse'},'context':first['context'],'filters':{'query':first['context']['query'],'max':'1000000','priceStatus':'known'}})
        assert all(o['price'] is not None and o['price']<=1000000 for o in cheaper['results']['offers'])
        old=conversation;conversation+='-other'
        send({'action':{'type':'agent.clarify','payload':{'candidateSetId':cid,'field':question['field'],'value':question['options'][0]['value']}}},400)
        conversation=old
        product=Product.objects.get(source_id=first['results']['products'][0]['id'])
        offer=Offer.objects.filter(product=product).first()
        for view,kwargs,scene in [('map',{'product_ids':[product.id]},'map'),('sellers',{'product_ids':[product.id]},'compare'),('visit',{'offer_ids':[offer.id]},'visit'),('mission',{'query':'شارژر گوشی','departure':'2026-10-23T23:30'},'mission')]:
            ui=services.render_workspace(view,**kwargs)
            with patch('shopping.workspace.llm.chat',return_value={'reply':'آماده','ui':ui}):
                result=send({'action':{'type':'message.send'},'messages':[{'role':'user','text':'ادامه'}]})
            assert result['envelope']['scene']==scene,(view,result)
        plan=services.build_shopping_plan([product.id])
        raw={'reply':'برنامه آماده است','shopping_plan':plan,'resolved_product_source_ids':[product.source_id],'offers':[item['offer'] for stop in plan['stops'] for item in stop['items']]}
        with patch('shopping.workspace.llm.chat',return_value=raw):
            result=send({'action':{'type':'message.send'},'messages':[{'role':'user','text':'برنامه خرید'}]})
        assert result['envelope']['blocks'][0]['type']=='shopping_plan'
        assert result['results']['offers']
        with patch('shopping.workspace.llm.chat',return_value={'reply':'مقایسه','offers':services.compare_offers([offer.id])['offers']}):
            result=send({'action':{'type':'message.send'},'messages':[{'role':'user','text':'مقایسه پیشنهادها'}]})
        assert len(result['results']['products'])==1
        assert result['results']['offers'][0]['id']==offer.extra['offer_id']
        print('PASS: real-source equality, conversation, clarification, pagination, budget, session isolation, map/sellers/visit/mission rendering')
    finally:
        # Only disposable regression sessions, never catalogue/user data.
        CandidateSet.objects.filter(session_key=owner_key).delete()

if __name__=='__main__':main()
