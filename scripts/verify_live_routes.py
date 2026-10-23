import json,urllib.request,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out={'origin':{'lat':35.6953,'lon':51.4107,'label':'جمهوری؛ مبدأ آزمایش'},'shopId':'shop_dfa25fc93470a47ba753e216','modes':{}}
for mode in ('driving','walking'):
 url=f"http://127.0.0.1:{os.environ.get('TOROB_API_PORT','8787')}/api/route?shopId={out['shopId']}&lat=35.6953&lon=51.4107&mode={mode}"
 with urllib.request.urlopen(url,timeout=50) as r:data=json.load(r)
 if data.get('status')!='ready':raise RuntimeError(f'Actual {mode} route was unavailable')
 out['modes'][mode]=data
(root/'docs/LIVE_ROUTE_VERIFICATION.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({mode:{'distanceMeters':r['distanceMeters'],'durationSeconds':r['durationSeconds'],'geometryPoints':len(r['geometry']['coordinates']),'steps':len(r['steps'])} for mode,r in out['modes'].items()}))
