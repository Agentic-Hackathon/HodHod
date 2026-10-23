"""One bounded live-provider smoke test, only after configuring the server key."""
import os
import sys
import uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.workspace_settings')
import django
django.setup()
from django.conf import settings
from shopping import llm
from shopping.models import CandidateSet
from shopping.workspace import assemble

if not settings.LLM_API_KEY:
    print('NOT RUN: configure .env with configure-model.ps1 first. No live-model success is claimed.')
    sys.exit(2)
if settings.AGENT_MODE!='llm':
    print('NOT RUN: set AGENT_MODE=llm in .env first.')
    sys.exit(2)
key='live-smoke-'+uuid.uuid4().hex
try:
    reply=llm.chat([{'role':'user','content':'هدفون سونی می‌خواهم. با ابزارها جستجو کن و گزینه‌های واقعی را نمایش بده.'}],key)
    catalogue,context,_=assemble(reply,key)
    assert catalogue['products'],'Provider returned no grounded catalogue cards.'
    assert any(event['name']=='search_products' for event in reply.get('tool_results',[])),'Provider did not invoke search.'
    print(f'PASS: live {settings.LLM_MODEL}, {len(catalogue["products"])} source cards; tool calls: '+', '.join(event['name'] for event in reply['tool_results']))
finally:
    CandidateSet.objects.filter(session_key=key).delete()
