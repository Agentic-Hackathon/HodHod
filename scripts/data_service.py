"""Read-only, loopback-only demo API. Original CSVs are never modified."""
import argparse, collections, csv, json, math, os, sqlite3, time, unicodedata
from routing_service import get_route
from mission_service import mission_query
from exploration_service import explore
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('TOROB_DATA_DIR', ROOT / 'data' if (ROOT/'data'/'shops.csv').exists() else ROOT))
LOCAL = ROOT / '.local'
DB = LOCAL / 'torob.sqlite'
def norm(s):
    return unicodedata.normalize('NFKC', str(s or '')).replace('ي','ی').replace('ك','ک').replace('\u200c',' ').lower()
def clean(v):
    if v is None or v in ('null',''): return None
    return v
def nested(v, fallback):
    try: return json.loads(v) if clean(v) else fallback
    except (ValueError,TypeError): return fallback
def number(v):
    try:
        n=float(v)
        return n if math.isfinite(n) else None
    except (ValueError,TypeError): return None
def haversine(lat,lon,a,b):
    if None in (lat,lon,a,b): return None
    r=math.pi/180; p=(a-lat)*r; q=(b-lon)*r
    x=math.sin(p/2)**2+math.cos(lat*r)*math.cos(a*r)*math.sin(q/2)**2
    return 6371*2*math.asin(min(1,math.sqrt(x)))

def ingest(force=False):
    LOCAL.mkdir(exist_ok=True)
    paths=[DATA/(n+'.csv') for n in ('shops','products','offers')]
    if not all(p.exists() for p in paths):
        raise RuntimeError('CSV files missing. Set TOROB_DATA_DIR to the dataset folder; no invented dataset is substituted.')
    signature=json.dumps({'schema':2,'files':[(str(p),p.stat().st_size,p.stat().st_mtime) for p in paths]})
    if DB.exists() and not force:
        try:
            with sqlite3.connect(DB) as db:
                if db.execute("select value from meta where key='signature'").fetchone()[0]==signature: return
        except (sqlite3.Error,TypeError): pass
    start=time.monotonic(); tmp=LOCAL/'import.sqlite'
    if tmp.exists(): tmp.unlink()
    db=sqlite3.connect(tmp)
    db.executescript('''PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE shops(id TEXT PRIMARY KEY,name TEXT,lat REAL,lon REAL,payload TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,title TEXT,category TEXT,search TEXT,payload TEXT);
    CREATE TABLE offers(id TEXT PRIMARY KEY,product_id TEXT,shop_id TEXT,price REAL,changed TEXT,payload TEXT);
    ''')
    report={'files':{},'source':'dataset','currency':'تومان','normalization':'NFKC; Persian yeh/kaf; ZWNJ to space'}
    for name,path in zip(('shops','products','offers'),paths):
        missing=collections.Counter(); count=0; samples=[]; batch=[]
        with path.open(encoding='utf-8-sig',newline='') as f:
            reader=csv.DictReader(f)
            for raw in reader:
                count+=1
                for k,v in raw.items():
                    if clean(v) is None: missing[k]+=1
                if len(samples)<1:
                    samples.append({k:v for k,v in raw.items() if k not in ('contacts',)})
                if name=='shops':
                    lat,lon=number(raw['lat']),number(raw['lon'])
                    if lat is None or lon is None or not (-90<=lat<=90 and -180<=lon<=180): lat=lon=None
                    p={'id':raw['shop_id'],'name':raw['name'],'address':clean(raw['address']),'area':clean(raw['location_label']),'lat':lat,'lon':lon,'categories':nested(raw['category_names'],[]),'hours':nested(raw['weekly_hours'],{}),'payments':nested(raw['payment_options'],[]),'fastDelivery':nested(raw['supports_fast_delivery'],None),'website':clean(raw['website_url']),'instagram':clean(raw['instagram']),'syntheticPhone':True,'syntheticName':not bool(clean(raw['website_url']) or clean(raw['instagram']))}
                    batch.append((p['id'],p['name'],lat,lon,json.dumps(p,ensure_ascii=False)))
                elif name=='products':
                    p={'id':raw['product_id'],'title':clean(raw['persian_title']) or 'عنوان ثبت نشده','category':clean(raw['category_name']),'brand':clean(raw['brand_name']),'model':clean(raw['model']),'images':nested(raw['image_urls'],[]),'specs':nested(raw['specs'],[])}
                    batch.append((p['id'],p['title'],p['category'],norm(p['title']+' '+(p['brand'] or '')),json.dumps(p,ensure_ascii=False)))
                else:
                    p={'id':raw['offer_id'],'productId':raw['product_id'],'shopId':raw['shop_id'],'price':number(raw['price_toman']),'currency':'تومان','changedAt':clean(raw['last_price_changed_at']),'title':clean(raw['seller_title']),'description':clean(raw['description']),'warranty':nested(raw['warranty'],None),'inventoryVerified':False}
                    if p['price'] is not None and p['price']<0: p['price']=None
                    batch.append((p['id'],p['productId'],p['shopId'],p['price'],p['changedAt'],json.dumps(p,ensure_ascii=False)))
                if len(batch)>=2000:
                    db.executemany('INSERT INTO '+name+' VALUES ('+','.join('?' for _ in batch[0])+')',batch); batch=[]
            if batch: db.executemany('INSERT INTO '+name+' VALUES ('+','.join('?' for _ in batch[0])+')',batch)
            report['files'][name]={'columns':reader.fieldnames,'rows':count,'missing':dict(missing),'sample':samples}
        print(f'Indexed {name}: {count}',flush=True)
    db.executescript('''CREATE INDEX offers_product ON offers(product_id); CREATE INDEX offers_shop ON offers(shop_id); CREATE INDEX offers_price ON offers(price); CREATE INDEX products_category ON products(category); CREATE INDEX shops_geo ON shops(lat,lon);
    CREATE VIRTUAL TABLE product_search USING fts5(id UNINDEXED, search, tokenize='unicode61'); INSERT INTO product_search SELECT id,search FROM products;
    CREATE TABLE categories AS SELECT category name,COUNT(*) count FROM products WHERE category IS NOT NULL GROUP BY category;
    CREATE TABLE product_summary AS SELECT product_id,MIN(price) min_price,COUNT(*) offer_count FROM offers GROUP BY product_id;
    CREATE UNIQUE INDEX summary_product ON product_summary(product_id);''')
    report['orphanOffers']=db.execute('SELECT COUNT(*) FROM offers o LEFT JOIN products p ON p.id=o.product_id LEFT JOIN shops s ON s.id=o.shop_id WHERE p.id IS NULL OR s.id IS NULL').fetchone()[0]
    report['invalidCoordinates']=db.execute('SELECT COUNT(*) FROM shops WHERE lat IS NULL OR lon IS NULL').fetchone()[0]
    report['importSeconds']=round(time.monotonic()-start,2)
    db.execute('INSERT INTO meta VALUES (?,?)',('signature',signature)); db.execute('INSERT INTO meta VALUES (?,?)',('report',json.dumps(report,ensure_ascii=False)));db.commit();db.close()
    tmp.replace(DB)
    (LOCAL/'inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'docs').mkdir(exist_ok=True)
    (ROOT/'docs'/'DATA_INSPECTION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Import complete in {report["importSeconds"]}s',flush=True)

def connect():
    db=sqlite3.connect(f'file:{DB.as_posix()}?mode=ro',uri=True);db.row_factory=sqlite3.Row
    db.create_function('distance_km',4,haversine,deterministic=True)
    return db
def payload(row): return json.loads(row['payload'])
_price_cache={}
def price_range(db,q):
    category=q.get('category',[''])[0];text=q.get('q',[''])[0][:200];key=(category,text)
    if key in _price_cache:return _price_cache[key]
    conditions=['o.price IS NOT NULL','o.price>=0'];args=[]
    if category:conditions.append('p.category=?');args.append(category)
    if text:
        fts=' AND '.join('"'+t.replace('"','""')+'"*' for t in norm(text).split())
        if fts:conditions.append('p.id IN (SELECT id FROM product_search WHERE product_search MATCH ?)');args.append(fts)
    prices=[r[0] for r in db.execute('SELECT o.price FROM offers o JOIN products p ON p.id=o.product_id WHERE '+' AND '.join(conditions)+' ORDER BY o.price',args)]
    quantiles=[prices[round((len(prices)-1)*i/100)] for i in range(101)] if prices else [0]*101
    histogram=[0]*24
    if prices:
        lo,hi=math.log1p(prices[0]),math.log1p(prices[-1])
        for price in prices:histogram[min(23,int((math.log1p(price)-lo)/(hi-lo or 1)*23))]+=1
    result={'quantiles':quantiles,'histogram':histogram,'count':len(prices)}
    if len(_price_cache)>64:_price_cache.clear()
    _price_cache[key]=result;return result
def query(db,q):
    text=q.get('q',[''])[0][:200]; category=q.get('category',[''])[0]; page=max(0,min(10000,int(q.get('page',['0'])[0]))); limit=max(1,min(48,int(q.get('limit',['12'])[0])))
    cond=['1=1']; args=[]
    if text:
        terms=norm(text).split()
        fts=' AND '.join('"'+t.replace('"','""')+'"*' for t in terms)
        cond.append('p.id IN (SELECT id FROM product_search WHERE product_search MATCH ?)');args.append(fts)
    if category: cond.append('p.category=?');args.append(category)
    offercond=['o.product_id=p.id']; oa=[]
    price_status=q.get('priceStatus',['all'])[0]
    if price_status=='known': offercond.append('o.price IS NOT NULL')
    elif price_status=='unknown': offercond.append('o.price IS NULL')
    for key,op in [('min','>='),('max','<=')]:
        if q.get(key,[''])[0]: offercond.append('o.price '+op+' ?');oa.append(float(q[key][0]))
    if q.get('shop',[''])[0]: offercond.append('o.shop_id=?');oa.append(q['shop'][0])
    if q.get('warranty',[''])[0]=='1': offercond.append("json_extract(o.payload,'$.warranty') IS NOT NULL")
    if q.get('payment',[''])[0] or q.get('inPerson',[''])[0]=='1':
        pc=[]
        if q.get('payment',[''])[0]:pc.append("json_extract(j.value,'$.provider_name')=?");oa.append(q['payment'][0])
        if q.get('inPerson',[''])[0]=='1':pc.append("json_extract(j.value,'$.channel')='in_person'")
        offercond.append("o.shop_id IN (SELECT s.id FROM shops s,json_each(s.payload,'$.payments') j WHERE "+' AND '.join(pc)+')')
    if q.get('lat') and q.get('lon'):
        lat=float(q['lat'][0]);lon=float(q['lon'][0]);radius=float(q.get('radius',['100'])[0])
        offercond.append('o.shop_id IN (SELECT id FROM shops WHERE distance_km(?,?,lat,lon)<=?)');oa += [lat,lon,radius]
    if q.get('bounds'):
        west,south,east,north=map(float,q['bounds'][0].split(','))
        offercond.append('o.shop_id IN (SELECT id FROM shops WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?)');oa += [west,east,south,north]
    offerwhere=' AND '.join(offercond)
    cond.append('EXISTS(SELECT 1 FROM offers o WHERE '+offerwhere+')');args+=oa
    where=' AND '.join(cond)
    total=db.execute('SELECT COUNT(*) FROM products p WHERE '+where,args).fetchone()[0]
    rows=db.execute('SELECT p.payload FROM products p WHERE '+where+' ORDER BY p.rowid LIMIT ? OFFSET ?',args+[limit,page*limit]).fetchall()
    products=[payload(r) for r in rows]; ids=[p['id'] for p in products]
    offers=[];shops=[]
    if ids:
        # Filter offer rows with the exact same constraints as product existence.
        rows=db.execute('SELECT o.payload FROM offers o JOIN products p ON p.id=o.product_id WHERE p.id IN ('+','.join('?' for _ in ids)+') AND '+offerwhere+' ORDER BY o.price IS NULL,o.price',ids+oa).fetchall()
        offers=[payload(r) for r in rows]; sids=list({o['shopId'] for o in offers})
        if sids: shops=[payload(r) for r in db.execute('SELECT payload FROM shops WHERE id IN ('+','.join('?' for _ in sids)+')',sids)]
    return {'products':products,'offers':offers,'shops':shops,'total':total,'page':page,'source':'dataset'}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        url=urlparse(self.path);q=parse_qs(url.query,keep_blank_values=True)
        try:
            with connect() as db:
                if url.path=='/api/health': out={'status':'ok','source':'dataset','counts':{n:db.execute('SELECT COUNT(*) FROM '+n).fetchone()[0] for n in ('products','shops','offers')}}
                elif url.path=='/api/categories': out=[dict(r) for r in db.execute('SELECT * FROM categories ORDER BY count DESC')]
                elif url.path=='/api/payment-providers': out=[r[0] for r in db.execute("SELECT DISTINCT json_extract(j.value,'$.provider_name') FROM shops s,json_each(s.payload,'$.payments') j WHERE json_extract(j.value,'$.provider_name') IS NOT NULL ORDER BY 1")]
                elif url.path=='/api/search': out=query(db,q)
                elif url.path=='/api/mission': out=mission_query(db,q,norm)
                elif url.path=='/api/explore': out=explore(float(q.get('lat',['nan'])[0]),float(q.get('lon',['nan'])[0]),q.get('kind',['general'])[0],float(q.get('radius',['2000'])[0]))
                elif url.path=='/api/price-range': out=price_range(db,q)
                elif url.path=='/api/route':
                    shop=db.execute('SELECT lat,lon FROM shops WHERE id=?',(q.get('shopId',[''])[0],)).fetchone()
                    if not shop or shop['lat'] is None or shop['lon'] is None:raise ValueError('Unknown shop coordinates')
                    out=get_route((float(q.get('lon',['nan'])[0]),float(q.get('lat',['nan'])[0])),(shop['lon'],shop['lat']),q.get('mode',['driving'])[0])
                elif url.path=='/api/entities':
                    kind=q.get('kind',[''])[0];ids=q.get('ids',[''])[0].split(',')[:100]
                    if kind not in ('products','shops','offers'): raise ValueError('Unknown entity kind')
                    out=[payload(r) for r in db.execute('SELECT payload FROM '+kind+' WHERE id IN ('+','.join('?' for _ in ids)+')',ids)]
                elif url.path=='/api/scenarios':
                    rows=db.execute('SELECT p.payload,COUNT(o.id) n FROM products p JOIN offers o ON p.id=o.product_id WHERE p.category IN (?,?,?) GROUP BY p.id HAVING n>=2 ORDER BY n DESC LIMIT 5',('گوشی موبایل','هدفون، هدست و هندزفری','کیف و کاور گوشی')).fetchall()
                    if not rows: rows=db.execute('SELECT p.payload,COUNT(o.id) n FROM products p JOIN offers o ON p.id=o.product_id GROUP BY p.id HAVING n>=2 ORDER BY n DESC LIMIT 5').fetchall()
                    out=[payload(r) for r in rows]
                else: self.send_error(404);return
            body=json.dumps(out,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        except (ValueError,sqlite3.Error) as e:
            body=json.dumps({'error':str(e)}).encode();self.send_response(400);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--import-only',action='store_true');p.add_argument('--force',action='store_true');args=p.parse_args();ingest(args.force)
    if not args.import_only:
        port=int(os.environ.get('TOROB_API_PORT','8787'));print(f'Torob read-only dataset API http://127.0.0.1:{port}',flush=True);ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
