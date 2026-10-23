# مشارکت در هدهد

1. پیش‌نیازها و دیتاست را طبق README آماده کنید؛ `.env` شخصی در Git ثبت نمی‌شود.
2. برای توسعه از راه‌انداز یکپارچه بدون گزینهٔ production استفاده کنید.
3. کامپوننت جدید را در schema و registry ثبت کنید. اطلاعات کالا، قیمت و مکان باید با شناسهٔ منبع resolve شوند؛ خروجی HTML مدل پذیرفته نیست.
4. بررسی متناسب با تغییر را اجرا کنید: `pnpm lint`، `pnpm test`، `pnpm build` و آزمون Django. تغییر فیلتر یا منشأ آفر را با `scripts/test_brain_integration.py` و دیتاست واقعی بررسی کنید.
5. برای تغییر تعاملی آزمون مرورگر را به‌روز کنید. تصاویر README باید از خود برنامه باشند و پاسخ مسیریابی کنترل‌شده را توضیح دهند.

## تنظیم دستی توسعه

در Bash از ریشهٔ مخزن:

```bash
python3 -m venv .local/brain-venv
source .local/brain-venv/bin/activate
pip install -r backend/requirements-workspace.txt
export DJANGO_SETTINGS_MODULE=config.workspace_settings
python scripts/data_service.py --import-only
python backend/manage.py migrate --noinput
python backend/manage.py import_workspace
pnpm install --frozen-lockfile
```

سپس در سه ترمینال با همان محیط Python:

```bash
python scripts/data_service.py     # 8787
python scripts/serve_brain.py      # 8790
pnpm dev --port 5173 --strictPort  # 5173
```

متغیرهای سرویس داده مثل `TOROB_DATA_DIR` و endpointهای مسیریابی را در محیط shell صادر کنید. `.env` برای Django و `VITE_*` توسط loaderهای خودشان خوانده می‌شود. در ویندوز `start.ps1` محیط Python را مدیریت می‌کند.

کلید مدل، کوکی، محتوای `.env`، دیتابیس گفتگو و logهای شخصی را به issue یا commit اضافه نکنید. در خطای ارائه‌دهنده فقط نوع خطا، کد HTTP و اطلاعات پاک‌سازی‌شدهٔ غیرمحرمانه را گزارش کنید.
