# هدهد — دستیار هوشمند خرید حضوری تهران (گام ۱)

بک‌اند Django + Postgres، چت متنی با LLM، و ایمپورت CSV.

## بالا آوردن پروژه

```bash
# 1) دیتابیس
docker compose up -d

# 2) تنظیمات
cp .env.example .env        # LLM_API_KEY را پر کنید

# 3) بک‌اند
cd backend
python -m venv .venv && source .venv/bin/activate     # ویندوز: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations shopping
python manage.py migrate
python manage.py createsuperuser        # اختیاری (برای /admin)
python manage.py runserver
```

چت: http://127.0.0.1:8000/   |   ادمین: http://127.0.0.1:8000/admin/   |   آمار دیتا: http://127.0.0.1:8000/api/stats/

## ایمپورت CSV

فایل‌ها را در پوشه‌ی `data/` بگذارید. اول بدون ایمپورت واقعی نگاشت ستون‌ها را ببینید:

```bash
python manage.py import_csv shops    ../data/shops.csv    --dry-run
python manage.py import_csv products ../data/products.csv --dry-run
python manage.py import_csv offers   ../data/offers.csv   --dry-run
```

اگر ستونی «پیدا نشد» بود، `shopping/importer_mappings.py` را ویرایش کنید. بعد ایمپورت واقعی (ترتیب مهم است):

```bash
python manage.py import_csv shops    ../data/shops.csv
python manage.py import_csv products ../data/products.csv
python manage.py import_csv offers   ../data/offers.csv
```

برای ایمپورت دوباره از `--replace` استفاده کنید.
