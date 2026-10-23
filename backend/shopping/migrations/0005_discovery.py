from django.db import migrations, models
import uuid


def create_search_extension(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        with schema_editor.connection.cursor() as c:
            c.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
            c.execute('CREATE INDEX IF NOT EXISTS shopping_product_title_trgm ON shopping_product USING gin (normalized_title gin_trgm_ops)')
            c.execute('CREATE INDEX IF NOT EXISTS shopping_product_document_trgm ON shopping_product USING gin (search_document gin_trgm_ops)')


def drop_search_indexes(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        with schema_editor.connection.cursor() as c:
            c.execute('DROP INDEX IF EXISTS shopping_product_title_trgm')
            c.execute('DROP INDEX IF EXISTS shopping_product_document_trgm')


class Migration(migrations.Migration):
    dependencies = [('shopping', '0004_alter_offer_price')]
    operations = [
        migrations.AddField(model_name='product', name='normalized_title', field=models.TextField(blank=True, db_index=True)),
        migrations.AddField(model_name='product', name='search_document', field=models.TextField(blank=True)),
        migrations.CreateModel(name='CandidateSet', fields=[
            ('id',models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False,serialize=False)),
            ('session_key',models.CharField(max_length=80,db_index=True)),
            ('query',models.TextField()),('filters',models.JSONField(default=dict)),
            ('product_ids',models.JSONField(default=list)),
            ('semantic_scores',models.JSONField(default=dict)),
            ('total_matches',models.PositiveIntegerField(default=0)),
            ('created_at',models.DateTimeField(auto_now_add=True,db_index=True)),
        ]),
        migrations.RunPython(create_search_extension, drop_search_indexes),
    ]
