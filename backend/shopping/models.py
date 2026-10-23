import uuid
from django.db import models


class Shop(models.Model):
    """فروشگاه (جدول shops). نام و شماره برای اکثر فروشگاه‌ها جعلی است؛ لوکیشن واقعی است."""

    source_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(blank=True)
    business_type = models.CharField(blank=True)
    category = models.TextField(blank=True)
    description = models.TextField(blank=True)
    address = models.TextField(blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    phone = models.TextField(blank=True)
    instagram = models.CharField(blank=True)
    website = models.CharField(max_length=255, blank=True)
    working_hours = models.JSONField(null=True, blank=True)
    torobpay = models.BooleanField(null=True, blank=True)       # null = نامشخص
    installment = models.BooleanField(null=True, blank=True)    # null = نامشخص
    extra = models.JSONField(default=dict, blank=True)          # ستون‌های نگاشت‌نشده CSV

    class Meta:
        indexes = [models.Index(fields=["lat", "lng"])]

    def __str__(self):
        return f"{self.name or self.source_id}"


class Product(models.Model):
    """محصول پایه (BaseProduct)."""

    source_id = models.CharField(max_length=64, unique=True)
    title_fa = models.CharField(blank=True)
    title_en = models.CharField(blank=True)
    brand = models.CharField(blank=True)
    category = models.CharField(blank=True, db_index=True)
    description = models.TextField(blank=True)
    specs = models.JSONField(null=True, blank=True)
    image_url = models.TextField(blank=True)
    normalized_title = models.TextField(blank=True, db_index=True)
    search_document = models.TextField(blank=True)
    extra = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.title_fa or self.title_en or self.source_id


class Offer(models.Model):
    """محصول در فروشگاه (ProductInStore / جدول offers)."""

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="offers")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="offers")
    title = models.CharField(blank=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=24, decimal_places=2, null=True, blank=True)
    price_unit = models.CharField(max_length=32, default="toman")
    warranty = models.CharField(blank=True)
    price_updated_at = models.DateTimeField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["product", "price"])]


class CandidateSet(models.Model):
    """Session-bound bounded candidate snapshot. Never expose another visitor's set."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_key = models.CharField(max_length=80, db_index=True)
    query = models.TextField()
    filters = models.JSONField(default=dict)
    product_ids = models.JSONField(default=list)
    semantic_scores = models.JSONField(default=dict)
    total_matches = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
