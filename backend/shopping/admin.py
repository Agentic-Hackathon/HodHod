from django.contrib import admin

from .models import Offer, Product, Shop, CandidateSet

admin.site.register(Shop)
admin.site.register(Product)
admin.site.register(Offer)
admin.site.register(CandidateSet)
