"""Small, cached, rate-limited OSRM gateway; no changes to dataset SQLite."""
import json,os,threading,time,urllib.request,math
from collections import OrderedDict
ENDPOINTS={'driving':os.environ.get('TOROB_ROUTING_CAR_URL','https://routing.openstreetmap.de/routed-car'),'walking':os.environ.get('TOROB_ROUTING_FOOT_URL','https://routing.openstreetmap.de/routed-foot')}
_lock=threading.Lock();_last=0.;_cache=OrderedDict()
def get_route(origin,destination,mode):
 global _last
 if mode not in ENDPOINTS:raise ValueError('Invalid travel mode')
 if any(not math.isfinite(v) for v in (*origin,*destination)):raise ValueError('Invalid coordinate')
 if not(-180<=origin[0]<=180 and -90<=origin[1]<=90):raise ValueError('Invalid coordinate')
 key=(*origin,*destination,mode)
 with _lock:
  cached=_cache.get(key)
  if cached and time.monotonic()-cached[0]<(900 if cached[1].get('status')=='ready' else 10):return cached[1]
  # FOSSGIS requires <=1 request/second; queue both modes and all users here.
  pause=1.1-(time.monotonic()-_last)
  if pause>0:time.sleep(pause)
  _last=time.monotonic()
  profile='driving' if mode=='driving' else 'foot'
  url=f"{ENDPOINTS[mode].rstrip('/')}/route/v1/{profile}/{origin[0]},{origin[1]};{destination[0]},{destination[1]}?overview=full&geometries=geojson&steps=true"
  try:
   request=urllib.request.Request(url,headers={'User-Agent':'Hodhod-local-shopping/1.0 (local interactive route planner)','Accept':'application/json'})
   with urllib.request.urlopen(request,timeout=18) as response:data=json.load(response)
   raw=data.get('routes',[None])[0]
   if data.get('code')!='Ok' or not raw:return {'status':'unavailable','mode':mode}
   if raw.get('geometry',{}).get('type')!='LineString' or len(raw['geometry'].get('coordinates',[]))<2:return {'status':'unavailable','mode':mode}
   for field in ('distance','duration'):
    if not isinstance(raw.get(field),(int,float)) or not math.isfinite(raw[field]) or raw[field]<0:return {'status':'unavailable','mode':mode}
   result={'status':'ready','geometry':raw['geometry'],'distanceMeters':raw['distance'],'durationSeconds':raw['duration'],'mode':mode,'liveTraffic':False,'source':'OSRM / OpenStreetMap','calculatedAt':time.time(),'steps':[{'name':s.get('name',''),'distance':s.get('distance',0),'type':s.get('maneuver',{}).get('type',''),'modifier':s.get('maneuver',{}).get('modifier','')} for leg in raw.get('legs',[]) for s in leg.get('steps',[])]}
  except (OSError,ValueError,KeyError,IndexError):result={'status':'unavailable','mode':mode}
  _cache[key]=(time.monotonic(),result)
  while len(_cache)>256:_cache.popitem(last=False)
  return result
