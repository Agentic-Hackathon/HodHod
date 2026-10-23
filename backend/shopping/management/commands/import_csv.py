import csv
import json
import sys
import ast
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from datetime import datetime

from shopping.importer_mappings import MAPPINGS
from shopping.models import Offer, Product, Shop
from shopping.normalization import search_document, normalize, normalize_price_unit

BATCH = 5000
TRUE = {"1", "true", "yes", "y", "t", "بله", "دارد"}
FALSE = {"0", "false", "no", "n", "f", "خیر", "ندارد"}
JSON_FIELDS = {"working_hours", "specs"}
FLOAT_FIELDS = {"lat", "lng"}
BOOL_FIELDS = {"torobpay", "installment"}

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


def to_bool(v):
    s = (v or "").strip().lower()
    if s in TRUE:
        return True
    if s in FALSE:
        return False
    return None  # نامشخص


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_decimal(v):
    s = (v or "").strip().replace(",", "")
    try:
        return Decimal(s) if s else None
    except InvalidOperation:
        return None

def to_json(v):
    s = (v or "").strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except ValueError:
        pass
    try:
        return ast.literal_eval(s)
    except (ValueError, SyntaxError):
        return {"raw": s}

def to_dt(v):
    try:
        value = parse_datetime((v or "").strip())
        if value is not None and timezone.is_naive(value):
            value = timezone.make_aware(value)
        return value
    except ValueError:
        return None


def resolve(headers, mapping):
    """field -> نام واقعی ستون در CSV (یا None)."""
    lower = {h.lower().strip(): h for h in headers}
    result = {}
    for field, candidates in mapping.items():
        result[field] = next((lower[c.lower()] for c in candidates if c.lower() in lower), None)
    return result


class Command(BaseCommand):
    help = "ایمپورت CSV داخل Postgres.  مثال: import_csv shops ../data/shops.csv"

    def add_arguments(self, parser):
        parser.add_argument("table", choices=["shops", "products", "offers"])
        parser.add_argument("file")
        parser.add_argument("--dry-run", action="store_true", help="فقط نگاشت ستون‌ها را نشان بده")
        parser.add_argument("--replace", action="store_true", help="قبل از ایمپورت، جدول را خالی کن")

    def handle(self, *args, table, file, dry_run, replace, **opts):
        try:
            f = open(file, newline="", encoding="utf-8-sig")
        except OSError as exc:
            raise CommandError(str(exc))

        with f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            cols = resolve(headers, MAPPINGS[table])
            used = {c for c in cols.values() if c}

            self.stdout.write(self.style.MIGRATE_HEADING("نگاشت ستون‌ها:"))
            for field, col in cols.items():
                mark = self.style.SUCCESS(col) if col else self.style.ERROR("— پیدا نشد —")
                self.stdout.write(f"  {field:<20} <- {mark}")
            extras = [h for h in headers if h not in used]
            self.stdout.write(f"ستون‌های ذخیره‌شده در extra: {extras}")

            id_field = "source_id" if table != "offers" else None
            if table != "offers" and not cols["source_id"]:
                raise CommandError("ستون شناسه پیدا نشد؛ importer_mappings.py را اصلاح کنید.")
            if table == "offers" and not (cols["shop_source_id"] and cols["product_source_id"]):
                raise CommandError("ستون shop/product در offers پیدا نشد؛ importer_mappings.py را اصلاح کنید.")
            if dry_run:
                return
            if table == 'offers' and not replace and Offer.objects.exists():
                raise CommandError('Offers already exist; use --replace to avoid silently duplicating listings.')

            with transaction.atomic():
                if replace:
                    {"shops": Shop, "products": Product, "offers": Offer}[table].objects.all().delete()
                n = getattr(self, f"_load_{table}")(reader, cols, used)
        self.stdout.write(self.style.SUCCESS(f"{n} ردیف وارد شد."))

    # ---------- helpers ----------
    def _convert(self, row, cols, fields):
        data = {}
        for field in fields:
            col = cols.get(field)
            raw = row.get(col) if col else None
            if field in JSON_FIELDS:
                data[field] = to_json(raw)
            elif field in FLOAT_FIELDS:
                data[field] = to_float(raw)
            elif field in BOOL_FIELDS:
                data[field] = to_bool(raw)
            elif field == "price_unit":
                data[field] = normalize_price_unit(raw) if raw else ("toman" if cols.get("price") == "price_toman" else "unknown")
            elif field == "price":
                data[field] = to_decimal(raw)
            elif field == "price_updated_at":
                data[field] = to_dt(raw)
            else:
                data[field] = (raw or "").strip()
        return data

    def _flush(self, model, buf):
        if buf:
            model.objects.bulk_create(buf, ignore_conflicts=True)
            buf.clear()

    def _generic(self, model, reader, cols, used, fields):
        buf, n = [], 0
        for row in reader:
            if not (row.get(cols["source_id"]) or "").strip():
                continue
            data = self._convert(row, cols, fields)
            data["extra"] = {k: v for k, v in row.items() if k not in used and v not in (None, "")}
            if model is Product:
                data["normalized_title"] = normalize(data.get("title_fa") or data.get("title_en"))
                data["search_document"] = search_document(data)
            buf.append(model(**data))
            n += 1
            if len(buf) >= BATCH:
                self._flush(model, buf)
        self._flush(model, buf)
        return n

    def _load_shops(self, reader, cols, used):
        return self._generic(Shop, reader, cols, used, [k for k in cols])

    def _load_products(self, reader, cols, used):
        return self._generic(Product, reader, cols, used, [k for k in cols])

    def _load_offers(self, reader, cols, used):
        shops = dict(Shop.objects.values_list("source_id", "id"))
        products = dict(Product.objects.values_list("source_id", "id"))
        if not shops or not products:
            raise CommandError("اول shops و products را ایمپورت کنید.")
        fields = [k for k in cols if k not in ("shop_source_id", "product_source_id")]
        buf, n, skipped = [], 0, 0
        for row in reader:
            sid = (row.get(cols["shop_source_id"]) or "").strip()
            pid = (row.get(cols["product_source_id"]) or "").strip()
            if sid not in shops or pid not in products:
                skipped += 1
                continue
            data = self._convert(row, cols, fields)
            data["extra"] = {k: v for k, v in row.items() if k not in used and v not in (None, "")}
            data["price_unit"] = data.get("price_unit") or "unknown"
            buf.append(Offer(shop_id=shops[sid], product_id=products[pid], **data))
            n += 1
            if len(buf) >= BATCH:
                self._flush(Offer, buf)
        self._flush(Offer, buf)
        if skipped:
            self.stdout.write(self.style.WARNING(f"{skipped} ردیف به‌دلیل نبود فروشگاه/محصول رد شد."))
        return n
