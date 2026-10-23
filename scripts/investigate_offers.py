import json,sqlite3,csv
from pathlib import Path
root=Path(__file__).resolve().parents[1]
db=sqlite3.connect(root/'.local/torob.sqlite');db.row_factory=sqlite3.Row
shops=db.execute('SELECT * FROM shops WHERE name = ?',('وییس رامنوش',)).fetchall()
out=[]
for shop in shops:
 offers=db.execute('SELECT o.id,o.product_id,o.price,o.changed,o.payload,p.title,p.category FROM offers o JOIN products p ON o.product_id=p.id WHERE o.shop_id=? AND p.category=? ORDER BY o.price',(shop['id'],'چراغ پنلی و سقفی')).fetchall()
 first=db.execute('SELECT p.id FROM products p WHERE p.category=? AND EXISTS(SELECT 1 FROM offers o JOIN shops s ON o.shop_id=s.id WHERE o.product_id=p.id AND s.id=?) ORDER BY p.rowid LIMIT 12',('چراغ پنلی و سقفی',shop['id'])).fetchall()
 ids={r['id'] for r in first}
 out.append({'shopId':shop['id'],'shopName':shop['name'],'categoryOffers':len(offers),'duplicateSameProductPairs':[dict(r) for r in db.execute('SELECT product_id,COUNT(*) count FROM offers WHERE shop_id=? GROUP BY product_id HAVING count(*)>1',(shop['id'],))],'firstProducts':[ {k:v for k,v in dict(o).items() if k!='payload'} for o in offers if o['product_id'] in ids]})
with (root/'offers.csv').open(encoding='utf8',newline='') as source:
 raw=[row for row in csv.DictReader(source) if any(row['shop_id']==s['shopId'] for s in out)]
for shop in out:
 expected={r['id']:r for r in shop['firstProducts']}
 shop['rawCsvVerification']={'file':'offers.csv','shopOfferRows':sum(r['shop_id']==shop['shopId'] for r in raw),'matchingFirstProductOffers':sum(r['offer_id'] in expected and r['product_id']==expected[r['offer_id']]['product_id'] and (float(r['price_toman']) if r['price_toman'] not in ('null','') else None)==expected[r['offer_id']]['price'] for r in raw)}
(root/'docs/DUPLICATE_INVESTIGATION.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([{k:v for k,v in shop.items() if k!='firstProducts'} for shop in out],ensure_ascii=False,indent=2))
