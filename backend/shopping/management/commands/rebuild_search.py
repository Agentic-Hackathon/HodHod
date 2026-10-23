from django.core.management.base import BaseCommand
from shopping.models import Product
from shopping.normalization import normalize, search_document

class Command(BaseCommand):
    help = 'Populate normalized search fields for existing imported records.'
    def handle(self, *args, **opts):
        count, batch = 0, []
        for p in Product.objects.all().iterator(chunk_size=2000):
            new = {'title_fa':p.title_fa,'title_en':p.title_en,'brand':p.brand,'category':p.category}
            p.normalized_title = normalize(p.title_fa or p.title_en)
            p.search_document = search_document(new)
            batch.append(p)
            if len(batch) >= 2000:
                Product.objects.bulk_update(batch,['normalized_title','search_document'],batch_size=2000)
                count += len(batch); batch.clear()
        if batch:
            Product.objects.bulk_update(batch,['normalized_title','search_document'],batch_size=2000)
            count += len(batch)
        self.stdout.write(self.style.SUCCESS(f'{count} products indexed'))
