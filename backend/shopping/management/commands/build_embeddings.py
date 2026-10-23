"""Build real product embeddings; requires existing imported products and pgvector docker image."""
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.conf import settings
from shopping.models import Product
from shopping.embedding import encode,vector_literal

class Command(BaseCommand):
    help='Optionally index REAL imported products in pgvector (sentence-transformers dependency).'
    def add_arguments(self,parser):
        parser.add_argument('--batch-size',type=int,default=64)
        parser.add_argument('--limit',type=int,default=0,help='0 means all products')
        parser.add_argument('--rebuild',action='store_true')
        parser.add_argument('--create-index',action='store_true',help='Build optional HNSW cosine index after embedding.')
    def handle(self,*args, batch_size,limit,rebuild,create_index,**opts):
        if connection.vendor!='postgresql':raise CommandError('PostgreSQL required.')
        if batch_size<1 or batch_size>512 or limit<0:raise CommandError('Invalid batch/limit.')
        try:
            dummy=encode(['یک محصول آزمایشی برای اندازه‌گیری بردار'],batch_size=1)[0]
        except (ImportError,OSError,RuntimeError) as exc:
            raise CommandError('sentence-transformers model unavailable: '+str(exc))
        dim=len(dummy)
        with connection.cursor() as cur:
            try:cur.execute('CREATE EXTENSION IF NOT EXISTS vector')
            except Exception as exc:raise CommandError('pgvector extension unavailable') from exc
            cur.execute(f'''CREATE TABLE IF NOT EXISTS shopping_product_embedding(
                product_id bigint PRIMARY KEY REFERENCES shopping_product(id) ON DELETE CASCADE,
                embedding vector({int(dim)}) NOT NULL)''')
            if rebuild:cur.execute('TRUNCATE shopping_product_embedding')
            else:
                cur.execute('SELECT atttypmod FROM pg_attribute WHERE attrelid = %s::regclass AND attname=%s',
                           ['shopping_product_embedding','embedding'])
                registered=cur.fetchone()
                if registered and registered[0] not in (-1,dim):
                    raise CommandError('Embedding dimension mismatch: use the same model or recreate the embedding table.')
        ids=Product.objects.all().order_by('id')
        if limit:ids=ids[:limit]
        count=0;batch=[]
        def flush(items):
            nonlocal count
            embeddings=encode([x.search_document or x.title_fa or x.title_en for x in items],batch_size=batch_size)
            with connection.cursor() as cur:
                for p,v in zip(items,embeddings):
                    cur.execute('INSERT INTO shopping_product_embedding(product_id,embedding) VALUES(%s,%s::vector) ON CONFLICT(product_id) DO UPDATE SET embedding=EXCLUDED.embedding',
                                [p.id,vector_literal(v)])
            count+=len(items)
        for p in ids.iterator(chunk_size=batch_size):
            batch.append(p)
            if len(batch)>=batch_size:flush(batch);batch=[]
        if batch:flush(batch)
        if create_index:
            self.stdout.write('Building HNSW index on imported real vectors (may need considerable disk/RAM)...')
            with connection.cursor() as cur:
                cur.execute('CREATE INDEX IF NOT EXISTS shopping_embedding_cosine_hnsw ON shopping_product_embedding USING hnsw (embedding vector_cosine_ops)')
        self.stdout.write(self.style.SUCCESS(f'Indexed {count} real product vectors ({dim} dims).'))
