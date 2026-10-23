"""Audit real imported catalogue without printing simulated scores or exposing contact numbers."""
import json
from django.core.management.base import BaseCommand
from django.db.models import Count,Q
from shopping.models import Shop,Product,Offer

class Command(BaseCommand):
    help='Check counts, missing product search index, geo coverage and offer metadata after importing Torob CSV.'
    def handle(self,*args,**opts):
        units=dict(Offer.objects.values('price_unit').annotate(n=Count('id')).values_list('price_unit','n'))
        report={
            'shops':Shop.objects.count(),'products':Product.objects.count(),'offers':Offer.objects.count(),
            'shops_with_coordinates':Shop.objects.filter(lat__isnull=False,lng__isnull=False).count(),
            'products_with_normalized_search':Product.objects.exclude(normalized_title='').count(),
            'offers_with_price':Offer.objects.filter(price__isnull=False).count(),
            'offers_with_price_update':Offer.objects.filter(price_updated_at__isnull=False).count(),
            'offers_by_price_unit':units,
            'potentially_pseudonymous_shop_names':Shop.objects.filter(instagram='',website='').count(),
            'note':'Field completeness only. No product matching/availability accuracy has been established.'
        }
        self.stdout.write(json.dumps(report,ensure_ascii=False,indent=2))
