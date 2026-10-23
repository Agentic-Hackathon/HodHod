import json,sys,time,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import data_service as d
out={}
for name,params in [('page',{'limit':['12']}),('nearby_1km',{'lat':['35.6953'],'lon':['51.4107'],'radius':['1'],'limit':['12']}),('payment',{'inPerson':['1'],'limit':['12']})]:
 with d.connect() as db:
  start=time.perf_counter();result=d.query(db,params)
  out[name]={'seconds':round(time.perf_counter()-start,4),'totalProducts':result['total'],'pageProducts':len(result['products']),'pageOffers':len(result['offers']),'jsonBytes':len(json.dumps(result,ensure_ascii=False).encode('utf8'))}
out['sqliteBytes']=d.DB.stat().st_size
(d.ROOT/'docs'/'PERFORMANCE.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps(out,indent=2))
