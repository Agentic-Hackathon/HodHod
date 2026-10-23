import datetime as dt
import json
import unittest
from unittest.mock import patch
import data_service as d
import exploration_service as e
from mission_service import mission_query, schedule_at

class MissionTests(unittest.TestCase):
 def setUp(self):
  e._cache.clear();e._backoff_until=0
 def test_source_rows_shortlist_and_exclusions(self):
  with d.connect() as db:
   q={'q':['شارژر'],'lat':['35.6953'],'lon':['51.4107'],'radius':['2'],'departure':['2026-10-23T20:00:00Z']}
   result=mission_query(db,q,d.norm)
   self.assertGreater(result['totalShops'],0);self.assertLessEqual(len(result['entries']),24)
   ids=set()
   for entry in result['entries']:
    self.assertNotIn(entry['shop']['id'],ids);ids.add(entry['shop']['id'])
    original=json.loads(db.execute('SELECT payload FROM offers WHERE id=?',(entry['offer']['id'],)).fetchone()[0])
    self.assertEqual(original,entry['offer']);self.assertEqual(entry['offer']['shopId'],entry['shop']['id'])
    self.assertFalse(entry['offer']['inventoryVerified']);self.assertLessEqual(entry['distance'],30)
   chosen=result['entries'][0]
   omitted=mission_query(db,{**q,'excludeShops':[chosen['shop']['id']]},d.norm)
   self.assertEqual(omitted['totalShops'],result['totalShops']-1)
   self.assertTrue(all(x['shop']['id']!=chosen['shop']['id'] for x in omitted['entries']))
   priced=mission_query(db,{**q,'max':['500000']},d.norm)
   self.assertTrue(all(x['offer']['price'] is not None and x['offer']['price']<=500000 for x in priced['entries']))
   phones=mission_query(db,{**q,'category':['شارژر گوشی']},d.norm)
   self.assertGreater(phones['totalShops'],0)
   self.assertTrue(all(x['product']['category']=='شارژر گوشی' for x in phones['entries']))
 def test_missing_and_invalid_input(self):
  with d.connect() as db:
   with self.assertRaises(ValueError):mission_query(db,{'q':['charger'],'lat':['nan'],'lon':['51']},d.norm)
   with self.assertRaises(ValueError):mission_query(db,{'q':['charger'],'lat':['35'],'lon':['51'],'departure':['2026-10-23T23:30']},d.norm)
 def test_overnight_status_and_unknown(self):
  shop={'hours':{'fri':{'status':'declared','shifts':[{'start_time':'20:00:00','end_time':'02:00:00'}]}}}
  self.assertEqual(schedule_at(shop,dt.datetime(2026,10,24,1)),'open')
  self.assertEqual(schedule_at(shop,dt.datetime(2026,10,24,3)),'unknown')
  self.assertEqual(schedule_at({'hours':{'fri':{'status':'declared','shifts':[{'start_time':'00:00:00','end_time':'00:00:00'}]}}},dt.datetime(2026,10,23,1)),'unknown')
 def test_exploration_failure_never_creates_an_offer(self):
  with patch.object(e,'urlopen',side_effect=OSError('offline')):
   result=e.explore(35.6953,51.4107,'electronics')
  self.assertEqual(result['status'],'unavailable');self.assertEqual(result['places'],[])
  with patch.object(e,'urlopen') as network:
   e.explore(35.6953,51.4107,'electronics')
   network.assert_not_called()
 def test_exploration_has_explicit_unknown_stock_and_membership(self):
  class Response:
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def read(self,n):return json.dumps({'elements':[{'type':'node','id':123,'lat':35.69,'lon':51.41,'tags':{'name':'A shop','shop':'electronics','opening_hours':'24/7'}}]}).encode()
  with patch.object(e,'urlopen',return_value=Response()):
   result=e.explore(35.696,51.411,'electronics')
  self.assertEqual(result['places'][0]['inventory'],'unknown');self.assertEqual(result['places'][0]['membership'],'unknown')
  self.assertEqual(result['places'][0]['sourceUrl'],'https://www.openstreetmap.org/node/123');self.assertNotIn('price',result['places'][0])
if __name__=='__main__':unittest.main(verbosity=2)
