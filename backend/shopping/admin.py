from django.contrib import admin

from .models import Offer, Product, Shop

admin.site.register(Shop)
admin.site.register(Product)
admin.site.register(Offer)
