import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from django.test import TestCase, Client, override_settings
from . import services, llm
from .models import Product

class WorkspaceTests(TestCase):
    def test_images_reject_non_images_and_report_missing_key(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        bad=SimpleUploadedFile('x.png',b'not an image',content_type='image/png')
        self.assertEqual(self.client.post('/api/workspace/image/',{'image':bad}).status_code,400)
        with override_settings(LLM_API_KEY=''):
            picture=SimpleUploadedFile('x.png',b'\x89PNG\r\n\x1a\nrest',content_type='image/png')
            self.assertEqual(self.client.post('/api/workspace/image/',{'image':picture}).json()['status'],'unavailable')
    def test_bootstrap_has_no_secret(self):
        with override_settings(LLM_API_KEY='do-not-publish',LLM_MODEL='gpt-5-mini'):
            r=self.client.get('/api/workspace/bootstrap/')
            self.assertEqual(r.status_code,200)
            self.assertTrue(r.json()['llmConfigured'])
            self.assertNotIn('do-not-publish',r.content.decode())

    def test_csrf_and_bad_shapes(self):
        c=Client(enforce_csrf_checks=True)
        self.assertEqual(c.post('/api/workspace/dispatch/',data='{}',content_type='application/json').status_code,403)
        token=c.get('/api/workspace/bootstrap/').json()['csrfToken']
        for invalid in ({'action':[]},{'location':[]},{'messages':{}},{'action':{'payload':[]}}):
            body={'sessionId':'a','requestId':str(invalid),**invalid}
            self.assertEqual(c.post('/api/workspace/dispatch/',data=json.dumps(body),content_type='application/json',HTTP_X_CSRFTOKEN=token).status_code,400)

    def test_owner_separates_browsers_and_conversations(self):
        from .workspace import owner
        from django.test import RequestFactory
        from django.contrib.sessions.middleware import SessionMiddleware
        def request():
            r=RequestFactory().get('/')
            SessionMiddleware(lambda r:None).process_request(r)
            return r
        a,b=request(),request()
        self.assertNotEqual(owner(a,'same'),owner(b,'same'))
        self.assertNotEqual(owner(a,'same'),owner(a,'other'))

    def test_render_rejects_invented_entities(self):
        with self.assertRaises(services.ServiceError):services.render_workspace('visit',offer_ids=[987654])
        with self.assertRaises(services.ServiceError):services.render_workspace('arbitrary-code')

    def test_official_sdk_openai_compatible_tool_loop(self):
        # Real SDK over loopback HTTP; simulated provider, never a live-model claim.
        calls=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                calls.append(body)
                message={'role':'assistant','content':'آماده است'}
                if len(calls)==1:
                    message={'role':'assistant','content':None,'tool_calls':[{'id':'call_a','type':'function','function':{'name':'search_products','arguments':'{"query":"charger"}'}}]}
                value={'id':'chatcmpl-test','object':'chat.completion','created':0,'model':'gpt-5-mini','choices':[{'index':0,'message':message,'finish_reason':'tool_calls' if len(calls)==1 else 'stop'}]}
                data=json.dumps(value).encode()
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with override_settings(AGENT_MODE='llm',LLM_PROVIDER='openai',LLM_MODEL='gpt-5-mini',LLM_API_KEY='test-only',LLM_BASE_URL=f'http://127.0.0.1:{server.server_port}/v1'),patch.object(llm,'_invoke',return_value={'count':0}):
                reply=llm.chat([{'role':'user','content':'charger'}],'test')
            self.assertEqual(reply['reply'],'آماده است')
            self.assertEqual(len(calls),2)
            self.assertEqual(calls[0]['model'],'gpt-5-mini')
            self.assertNotIn('temperature',calls[0])
            self.assertEqual(calls[1]['messages'][-1]['role'],'tool')
        finally:server.shutdown();server.server_close();thread.join()
