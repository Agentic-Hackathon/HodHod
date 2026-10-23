"""
نگاشت ستون‌های CSV به فیلدهای مدل.

برای هر فیلد مدل، لیستی از نام‌های محتمل ستون در CSV (بدون حساسیت به حروف بزرگ/کوچک).
اگر اسم ستون‌های دیتاست شما فرق دارد، فقط همین فایل را ویرایش کنید.
ستون‌هایی که اینجا نیامده‌اند خودکار در فیلد `extra` (JSON) ذخیره می‌شوند و چیزی از دست نمی‌رود.
با `--dry-run` می‌توانید ببینید کدام ستون به کدام فیلد وصل شده.
"""

SHOPS = {
    "source_id": ["id", "shop_id", "shop_key", "shopid", "شناسه"],
    "name": ["name", "shop_name", "title", "نام"],
    "business_type": ["business_type", "type", "shop_type"],
    "category": ["category_names", "category", "activity_category", "business_category", "categories"],
    "description": ["description", "about", "introduction"],
    "address": ["address", "short_address", "full_address"],
    "lat": ["lat", "latitude"],
    "lng": ["lng", "lon", "long", "longitude"],
    "phone": ["contacts", "phone", "tel"],
    "instagram": ["instagram", "instagram_url", "instagram_id"],
    "website": ["website", "site", "url", "website_url"],
    "working_hours": ["weekly_hours", "working_hours", "opening_hours", "schedule"],
    "torobpay": ["torobpay", "torob_pay", "has_torobpay", "torobpay_status"],
    "installment": ["installment", "has_installment", "installment_services", "credit"],

}

PRODUCTS = {
    "source_id": ["id", "product_id", "base_product_id", "random_key", "شناسه"],
    "title_fa": ["title_fa", "name_fa", "persian_title", "name1", "title", "name"],
    "title_en": ["title_en", "name_en", "model"],
    "brand": ["brand", "brand_name"],
    "category": ["category", "category_title", "categories", "category_name"],
    "description": ["description", "desc"],
    "specs": ["specs", "specifications", "attributes", "technical_specs", "structured_specs"],
    "image_url": ["image_url", "image", "images", "image_urls"],
}

OFFERS = {
    "shop_source_id": ["shop_id", "shop", "shop_key", "store_id"],
    "product_source_id": ["product_id", "base_product_id", "product", "random_key", "product_key"],
    "title": ["seller_title", "title", "offer_title"],
    "description": ["description", "desc"],
    "price": ["price_toman", "price", "offer_price"],
    "warranty": ["warranty", "guarantee", "warranty_title"],
    "price_unit": ["price_unit", "currency", "unit"],
    "price_updated_at": ["last_price_changed_at", "price_updated_at", "updated_at"],
}

MAPPINGS = {"shops": SHOPS, "products": PRODUCTS, "offers": OFFERS}
