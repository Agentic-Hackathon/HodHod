"""Import the already validated, read-only Torob index without replacing any user DB."""
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from shopping.models import Product, Shop, Offer
from shopping.normalization import normalize, search_document

class Command(BaseCommand):
    help = 'Import the complete original workspace catalogue, preserving every source ID.'
    def add_arguments(self, parser):
        parser.add_argument('--source', default=str(settings.BASE_DIR.parent / '.local' / 'torob.sqlite'))
    def handle(self, *args, **options):
        path = Path(options['source']).resolve()
        if not path.exists(): raise CommandError('Run scripts/data_service.py --import-only first.')
        source = sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)
        target = {'shops': Shop, 'products': Product, 'offers': Offer}
        counts = {table: source.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in target}
        signature = {'size': path.stat().st_size, 'mtime': path.stat().st_mtime_ns, 'counts': counts}
        stamp = settings.BASE_DIR.parent / '.local' / 'brain-import.json'
        current = {table: model.objects.count() for table, model in target.items()}
        if current == counts and stamp.exists() and json.loads(stamp.read_text()) == signature:
            self.stdout.write('Complete catalogue already imported.'); return
        if any(current.values()): raise CommandError('Existing brain catalogue is not the expected import. No rows were replaced.')
        def rows(table):
            for rowid, raw in source.execute('SELECT rowid,payload FROM '+table+' ORDER BY rowid'):
                yield rowid, json.loads(raw)
        def write(model, iterator):
            batch = []; count = 0
            for obj in iterator:
                batch.append(obj)
                if len(batch) == 1500:
                    model.objects.bulk_create(batch); count += len(batch); batch.clear()
            if batch: model.objects.bulk_create(batch); count += len(batch)
            self.stdout.write(f'{model.__name__}: {count} source records', ending='\n'); self.stdout.flush()
        shop_ids = {}; product_ids = {}
        def shops():
            for pk, row in rows('shops'):
                shop_ids[row['id']] = pk
                yield Shop(id=pk, source_id=row['id'], name=row['name'], address=row['address'] or '', lat=row['lat'], lng=row['lon'], category=json.dumps(row['categories'], ensure_ascii=False), working_hours=row['hours'], website=row['website'] or '', instagram=row['instagram'] or '', extra={'location_label': row['area'], 'payment_options': json.dumps(row['payments'], ensure_ascii=False), 'supports_fast_delivery': row['fastDelivery']})
        def products():
            for pk, row in rows('products'):
                product_ids[row['id']] = pk
                specs = {s['key']: s['value'] for s in row['specs'] if s.get('key')}
                fields = {'title_fa': row['title'], 'title_en': row['model'] or '', 'brand': row['brand'] or '', 'category': row['category'] or '', 'specs': specs}
                yield Product(id=pk, source_id=row['id'], **fields, image_url=next(iter(row['images']), ''), normalized_title=normalize(row['title']), search_document=search_document(fields))
        def offers():
            for pk, row in rows('offers'):
                yield Offer(id=pk, shop_id=shop_ids[row['shopId']], product_id=product_ids[row['productId']], title=row['title'] or '', description=row['description'] or '', price=row['price'], price_unit='toman', price_updated_at=datetime.fromisoformat(row['changedAt'].replace('Z','+00:00')) if row['changedAt'] else None, warranty=json.dumps(row['warranty'],ensure_ascii=False) if row['warranty'] else '', extra={'offer_id':row['id']})
        with transaction.atomic():
            write(Shop, shops()); write(Product, products()); write(Offer, offers())
            if connection.vendor == 'sqlite':
                with connection.cursor() as cursor:
                    cursor.execute('CREATE VIRTUAL TABLE IF NOT EXISTS workspace_search USING fts5(document, tokenize="unicode61")')
                    cursor.execute('INSERT INTO workspace_search(rowid, document) SELECT id, search_document FROM shopping_product')
        stamp.write_text(json.dumps(signature), encoding='utf-8')
        source.close()
        self.stdout.write(self.style.SUCCESS('Full catalogue imported; original CSVs/index unchanged.'))
