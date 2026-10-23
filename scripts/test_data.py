"""Integration checks against the complete read-only SQLite index."""
import json,sqlite3,time,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import data_service as d
class DataTests(unittest.TestCase):
 def setUp(self): self.db=d.connect()
 def tearDown(self): self.db.close()
 def test_counts_and_join_integrity(self):
  for table,count in [('products',225903),('shops',6476),('offers',331506)]:self.assertEqual(self.db.execute('select count(*) from '+table).fetchone()[0],count)
  self.assertEqual(self.db.execute('select count(*) from offers o left join products p on p.id=o.product_id left join shops s on s.id=o.shop_id where p.id is null or s.id is null').fetchone()[0],0)
 def test_read_only(self):
  with self.assertRaises(sqlite3.OperationalError):self.db.execute("delete from shops where 1=0")
 def test_unknown_price_and_inventory(self):
  self.assertEqual(self.db.execute('select count(*) from offers where price is null').fetchone()[0],15083)
  o=json.loads(self.db.execute('select payload from offers limit 1').fetchone()[0]);self.assertFalse(o['inventoryVerified']);self.assertEqual(o['currency'],'تومان')
 def test_exact_product_real_offers(self):
  row=self.db.execute('select p.title,p.id from products p join product_summary s on s.product_id=p.id where s.offer_count>2 limit 1').fetchone();r=d.query(self.db,{'q':[row['title']]});self.assertTrue(any(p['id']==row['id'] for p in r['products']));self.assertTrue(all(o['productId'] in {p['id'] for p in r['products']} for o in r['offers']))
 def test_geo_and_budget_filters_same_for_products_and_offers(self):
  r=d.query(self.db,{'lat':['35.6953'],'lon':['51.4107'],'radius':['1'],'max':['5000000']});self.assertGreater(r['total'],0)
  self.assertTrue(all(o['price'] is not None and o['price']<=5000000 for o in r['offers']))
  self.assertTrue(all(d.haversine(35.6953,51.4107,s['lat'],s['lon'])<=1 for s in r['shops']))
 def test_pagination_and_limits(self):
  a=d.query(self.db,{'limit':['3']});b=d.query(self.db,{'limit':['3'],'page':['1']});self.assertEqual(len(a['products']),3);self.assertFalse({p['id'] for p in a['products']}&{p['id'] for p in b['products']});self.assertLessEqual(len(d.query(self.db,{'limit':['1000']})['products']),48)
 def test_price_status_applies_to_products_offers_counts_and_pages(self):
  for status in ('known','unknown'):
   op='IS NULL' if status=='unknown' else 'IS NOT NULL'
   expected=self.db.execute('SELECT COUNT(DISTINCT product_id) FROM offers WHERE price '+op).fetchone()[0]
   first=d.query(self.db,{'priceStatus':[status],'limit':['12']})
   second=d.query(self.db,{'priceStatus':[status],'limit':['12'],'page':['1']})
   self.assertEqual(first['total'],expected)
   self.assertEqual(second['total'],expected)
   self.assertFalse({p['id'] for p in first['products']}&{p['id'] for p in second['products']})
   for result in (first,second):
    self.assertEqual({p['id'] for p in result['products']},{o['productId'] for o in result['offers']})
    self.assertTrue(all((o['price'] is None)==(status=='unknown') for o in result['offers']))
 def test_missing_and_unicode_search(self):
  self.assertEqual(d.query(self.db,{'q':['__no_such_Torob_product_19283__']})['total'],0)
  self.assertEqual(d.norm('كيف يک'),'کیف یک')
 def test_radius_and_coordinate_order(self):
  self.assertAlmostEqual(d.haversine(0,0,0,1),111.1949,3)
  self.assertEqual(d.haversine(35,51,35,51),0)
 def test_price_distribution_is_real_sorted_and_category_scoped(self):
  category=self.db.execute('SELECT name FROM categories ORDER BY count DESC LIMIT 1').fetchone()[0]
  value=d.price_range(self.db,{'category':[category]})
  self.assertEqual(len(value['quantiles']),101);self.assertEqual(value['quantiles'],sorted(value['quantiles']))
  self.assertEqual(sum(value['histogram']),value['count'])
  for price in value['quantiles'][::10]:self.assertIsNotNone(self.db.execute('SELECT o.id FROM offers o JOIN products p ON p.id=o.product_id WHERE p.category=? AND o.price=? LIMIT 1',(category,price)).fetchone())
 def test_payment_and_warranty_keep_offer_provenance(self):
  r=d.query(self.db,{'inPerson':['1'],'warranty':['1'],'limit':['6']})
  self.assertGreater(r['total'],0)
  self.assertTrue(all(any(p.get('channel')=='in_person' for p in s['payments']) for s in r['shops']))
  self.assertTrue(all(o['warranty'] is not None for o in r['offers']))
if __name__=='__main__':unittest.main(verbosity=2)
