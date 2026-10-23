import { useState } from "react";
import { RoutePreview } from "../features/maps/RoutePreview";
import { VisitTiming } from "../features/visit/VisitTiming";
import { tehranInput } from "../features/visit/schedule";
import { uiEvents } from "../state/events";
import {
  ArrowUpLeft,
  Bookmark,
  Check,
  Clock,
  GitCompareArrows,
  MapPin,
  Navigation,
  PhoneOff,
  ShoppingBag,
  Store,
} from "lucide-react";
import type { Product, Offer, Shop, Location } from "../data/types";
import { fa, money, date, haversine, safeUrl } from "../i18n/format";
import { useStore } from "../state/store";
import { PurchaseOutcome } from "../features/mission/PurchaseOutcome";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  NoRouteFound,
  PartialDataState,
  ProductImage,
} from "./primitives";
export function PriceFreshness({ offer }: { offer: Offer }) {
  return (
    <span className="freshness">
      <Clock size={12} />
      آخرین تغییر قیمت: {date(offer.changedAt)}
    </span>
  );
}
export function AvailabilityUnverifiedNotice() {
  return <Badge tone="warning">موجودی تأیید نشده</Badge>;
}
export function SourceDisclosure() {
  return null;
}
export function DataConfidenceBadge() {
  return <Badge>مشخصات کالا</Badge>;
}
export function WhyRecommended({ children }: { children?: React.ReactNode }) {
  return (
    <p className="why">
      <Check size={14} />
      {children || "دارای آفر مرتبط با محصول در داده‌های ما"}
    </p>
  );
}
export function ProductCard({
  product,
  offers,
  onSelect,
}: {
  product: Product;
  offers: Offer[];
  onSelect: (p: Product) => void;
}) {
  const s = useStore((x) => x.session);
  const compare = useStore((x) => x.toggleCompare);
  const save = useStore((x) => x.toggleSave);
  const prices = offers
    .map((o) => o.price)
    .filter((p): p is number => p !== null);
  return (
    <article
      id={"card-" + product.id}
      className={`product-card ${s.selectedProduct === product.id ? "selected" : ""}`}
    >
      <div className="product-photo">
        <button
          className="photo-button"
          onClick={() => onSelect(product)}
          aria-label={"مشاهدهٔ " + product.title}
        >
          <ProductImage
            src={safeUrl(product.images[0])}
            title={product.title}
          />
        </button>
        <IconButton
          label={
            s.saved.includes(product.id) ? "حذف از ذخیره‌ها" : "ذخیرهٔ کالا"
          }
          onClick={() => save(product.id)}
          className={s.saved.includes(product.id) ? "active" : ""}
        >
          <Bookmark
            size={17}
            fill={s.saved.includes(product.id) ? "currentColor" : "none"}
          />
        </IconButton>
        <span className="photo-category">
          {product.brand || product.category || "کالا"}
        </span>
      </div>
      <div className="product-body">
        <button className="title-button" onClick={() => onSelect(product)}>
          <h3 dir="auto">{product.title}</h3>
        </button>
        <span className="muted small">
          <Store size={13} /> {fa(new Set(offers.map((o) => o.shopId)).size)}{" "}
          فروشنده در این نتایج
        </span>
        <div className="price-row">
          <span className="muted small">از</span>
          <strong>{money(prices.length ? Math.min(...prices) : null)}</strong>
          {prices.length > 0 && <small>تومان</small>}
        </div>
        <footer>
          <button className="text-link" onClick={() => onSelect(product)}>
            بررسی فروشندگان <ArrowUpLeft size={15} />
          </button>
          <IconButton
            label={
              s.compare.includes(product.id)
                ? "حذف از مقایسه"
                : "افزودن به مقایسه"
            }
            onClick={() => compare(product.id)}
            className={s.compare.includes(product.id) ? "active" : ""}
          >
            <GitCompareArrows size={17} />
          </IconButton>
        </footer>
      </div>
    </article>
  );
}
export function ProductGrid({
  products,
  offers,
  onSelect,
}: {
  products: Product[];
  offers: Offer[];
  onSelect: (p: Product) => void;
}) {
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          offers={offers.filter((o) => o.productId === p.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
export function ProductSpecs({ product }: { product: Product }) {
  return product.specs.length ? (
    <dl className="specs">
      {product.specs.map((s, i) => (
        <div key={i}>
          <dt>{s.key}</dt>
          <dd dir="auto">{s.value}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <PartialDataState>مشخصات فنی ثبت نشده است.</PartialDataState>
  );
}
export function ProductImageGallery({ product }: { product: Product }) {
  const [index, setIndex] = useState(0);
  return (
    <div className="image-gallery">
      <ProductImage
        src={safeUrl(product.images[index])}
        title={product.title}
      />
      {product.images.length > 1 && (
        <div className="thumbnails">
          {product.images.slice(0, 6).map((src, i) => (
            <button
              key={src}
              aria-label={"تصویر " + fa(i + 1)}
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
            >
              <ProductImage src={safeUrl(src)} title="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function ProductDetail({
  product,
  children,
}: {
  product: Product;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="product-detail">
        <ProductImageGallery product={product} />
        <div>
          <Badge>{product.category || "دسته نامشخص"}</Badge>
          <h2 dir="auto">{product.title}</h2>
          <p>{product.brand || "برند ثبت نشده"}</p>
          <DataConfidenceBadge />
        </div>
      </div>
      {children}
      <details className="section">
        <summary>مشخصات محصول</summary>
        <ProductSpecs product={product} />
      </details>
    </>
  );
}
export function PaymentMethodBadges({ shop }: { shop: Shop }) {
  return (
    <div className="badges">
      {shop.payments.length ? (
        shop.payments.map((v, i) => <Badge key={i}>{paymentLabel(v)}</Badge>)
      ) : (
        <span className="muted small">شرایط پرداخت ثبت نشده</span>
      )}
    </div>
  );
}
function paymentLabel(v: unknown) {
  if (typeof v === "string") return v;
  if (typeof v !== "object" || !v) return "شرایط پرداخت نامشخص";
  const p = v as Record<string, unknown>;
  return `${p.provider_name || "سرویس پرداخت"} · ${p.channel === "in_person" ? "پذیرندگی حضوری ثبت‌شده" : p.channel === "online" ? "آنلاین" : "روش استفاده نامشخص"}`;
}
export function WarrantyDetails({ offer }: { offer: Offer }) {
  return (
    <p className="muted small">
      گارانتی:{" "}
      {offer.warranty
        ? typeof offer.warranty === "string"
          ? offer.warranty
          : warrantyLabel(offer.warranty)
        : "نامشخص"}
    </p>
  );
}
function warrantyLabel(value: unknown) {
  const w = value as Record<string, unknown>;
  const parts = [
    w.provider,
    w.period_months ? `${fa(Number(w.period_months))} ماه` : null,
    w.description,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "جزئیات نامشخص";
}
export function DistanceAndETA({
  shop,
  location,
}: {
  shop: Shop;
  location: Location | null;
}) {
  return (
    <span className="small muted">
      <MapPin size={13} />
      {location && shop.lat !== null && shop.lon !== null
        ? fa(haversine(location, { lat: shop.lat, lon: shop.lon })) +
          " کیلومتر · فاصلهٔ مستقیم"
        : shop.area || "موقعیت نامشخص"}
    </span>
  );
}
export function OfferCard({
  offer,
  shop,
  onShop,
  onVisit,
}: {
  offer: Offer;
  shop?: Shop;
  onShop: () => void;
  onVisit: () => void;
}) {
  const loc = useStore((s) => s.session.location);
  return (
    <article className="offer-card">
      <div className="store-avatar">
        <Store size={23} />
      </div>
      <div className="offer-info">
        <button className="title-button" onClick={onShop}>
          <h3>{shop?.name || "فروشگاه نامشخص"}</h3>
        </button>
        {shop?.syntheticName && (
          <span className="small muted">نام نمایشی در دیتاست</span>
        )}
        {shop && <DistanceAndETA shop={shop} location={loc} />}
        <PriceFreshness offer={offer} />
        <WarrantyDetails offer={offer} />
      </div>
      <div className="offer-actions">
        <strong>
          {money(offer.price)}{" "}
          <small>{offer.price !== null ? "تومان" : ""}</small>
        </strong>
        <AvailabilityUnverifiedNotice />
        <Button onClick={onVisit}>
          برنامهٔ مراجعه
          <ArrowUpLeft size={15} />
        </Button>
      </div>
    </article>
  );
}
export function OffersByProduct({
  offers,
  shops,
  onShop,
  onVisit,
}: {
  offers: Offer[];
  shops: Shop[];
  onShop: (s: Shop) => void;
  onVisit: (o: Offer) => void;
}) {
  return (
    <section className="section">
      <h3>
        فروشندگان این کالا <span className="muted">({fa(offers.length)})</span>
      </h3>
      {offers.length ? (
        offers.map((o) => (
          <OfferCard
            key={o.id}
            offer={o}
            shop={shops.find((s) => s.id === o.shopId)}
            onShop={() => {
              const s = shops.find((s) => s.id === o.shopId);
              if (s) onShop(s);
            }}
            onVisit={() => onVisit(o)}
          />
        ))
      ) : (
        <EmptyState title="آفری با این فیلترها پیدا نشد" />
      )}
    </section>
  );
}
export function StoreCard({
  shop,
  onSelect,
}: {
  shop: Shop;
  onSelect: () => void;
}) {
  return (
    <button className="store-card" onClick={onSelect}>
      <Store />
      <strong>{shop.name}</strong>
      <span>{shop.area || "محله نامشخص"}</span>
    </button>
  );
}
export function StoreHours({ shop }: { shop: Shop }) {
  const days: Record<string, string> = {
    sat: "شنبه",
    sun: "یکشنبه",
    mon: "دوشنبه",
    tue: "سه‌شنبه",
    wed: "چهارشنبه",
    thu: "پنجشنبه",
    fri: "جمعه",
  };
  return Object.keys(shop.hours).length ? (
    <div className="hours">
      <h3>
        <Clock size={17} />
        برنامهٔ کاری ثبت‌شده
      </h3>
      {Object.entries(days).map(([key, label]) => {
        const d = shop.hours[key];
        return (
          <div key={key}>
            <span>{label}</span>
            <span>
              {!d
                ? "نامشخص"
                : d.status === "closed"
                  ? "تعطیل"
                  : d.shifts
                      ?.map(
                        (x) =>
                          `${x.start_time.slice(0, 5)} تا ${x.end_time.slice(0, 5)}`,
                      )
                      .join(" / ") || "نامشخص"}
            </span>
          </div>
        );
      })}
      <small className="muted">
        این برنامه تضمین بازبودن در زمان مراجعه نیست.
      </small>
    </div>
  ) : (
    <PartialDataState>ساعت کاری ثبت نشده است.</PartialDataState>
  );
}
export function StoreLocationDetails({ shop }: { shop: Shop }) {
  return (
    <div className="location-details">
      <MapPin />
      <p>
        {shop.address || "آدرس ثبت نشده"}
        <small>{shop.area}</small>
      </p>
    </div>
  );
}
export function DirectionsAction({ shop }: { shop: Shop }) {
  return shop.lat !== null && shop.lon !== null ? (
    <a
      className="button primary"
      target="_blank"
      rel="noreferrer"
      href={`https://www.openstreetmap.org/directions?to=${shop.lat},${shop.lon}`}
    >
      <Navigation size={16} />
      بازکردن مسیریاب
    </a>
  ) : (
    <PartialDataState>مختصات معتبر ثبت نشده است.</PartialDataState>
  );
}
export function StoreDetailSheet({
  shop,
  children,
}: {
  shop: Shop;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="store-heading">
        <div className="store-avatar">
          <Store />
        </div>
        <div>
          <h2>{shop.name}</h2>
          <Badge>
            {shop.syntheticName
              ? "نام فروشگاه در دیتاست نمایشی است"
              : "دارای وب‌سایت یا صفحهٔ ثبت‌شده"}
          </Badge>
        </div>
      </div>
      <StoreLocationDetails shop={shop} />
      <PaymentMethodBadges shop={shop} />
      <StoreHours shop={shop} />
      <PartialDataState>
        <PhoneOff size={15} />
        تمام شماره‌های این دیتاست آزمایشی‌اند؛ تماس واقعی ارائه نمی‌شود.
      </PartialDataState>
      <DirectionsAction shop={shop} />
      {safeUrl(shop.website) && (
        <a
          className="text-link external-link"
          href={safeUrl(shop.website)}
          target="_blank"
          rel="noreferrer"
        >
          وب‌سایت ثبت‌شده
          <ArrowUpLeft size={15} />
        </a>
      )}
      {children}
    </>
  );
}
export function StoreInquiryDraft({
  product,
  offer,
}: {
  product?: Product;
  offer?: Offer;
}) {
  const [copied, setCopied] = useState(false);
  const text = `سلام، ${product?.title || offer?.title || "این کالا"} موجود است؟ لطفاً قیمت فعلی، گارانتی و ساعت مراجعهٔ حضوری را اعلام کنید.`;
  return (
    <section className="inquiry section">
      <Badge tone="warning">پیش‌نویس نمایشی · ارسال نشده</Badge>
      <h3>پیش از رفتن، مطمئن شوید</h3>
      <p>{text}</p>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "متن کپی شد" : "کپی متن استعلام"}
      </Button>
      <FollowUpStatus />
    </section>
  );
}
export function FollowUpStatus() {
  return (
    <p className="small muted">
      وضعیت پیگیری: انجام نشده · هیچ پیامی ارسال نمی‌شود.
    </p>
  );
}
export function VisitChecklist({
  checks,
  onChange,
}: {
  checks: string[];
  onChange: (checks: string[]) => void;
}) {
  return (
    <div className="checklist">
      {["استعلام قیمت و موجودی", "بررسی گارانتی", "بررسی ساعت مراجعه"].map(
        (x) => (
          <label key={x}>
            <input
              type="checkbox"
              checked={checks.includes(x)}
              onChange={() =>
                onChange(
                  checks.includes(x)
                    ? checks.filter((v) => v !== x)
                    : [...checks, x],
                )
              }
            />
            {x}
          </label>
        ),
      )}
    </div>
  );
}
export function VisitSummary({
  product,
  offer,
  shop,
}: {
  product?: Product;
  offer?: Offer;
  shop?: Shop;
}) {
  const { session: s, set } = useStore();
  const plan = s.plans.find((p) => p.offerId === offer?.id);
  const [checks, setChecks] = useState<string[]>(plan?.checks || []);
  const [quantity, setQuantity] = useState(plan?.quantity || 1);
  const [departure, setDeparture] = useState(plan?.departure || tehranInput());
  if (!offer || !shop)
    return (
      <EmptyState
        title="ابتدا یک فروشنده انتخاب کنید"
        description="از صفحهٔ محصول، برنامهٔ مراجعه را باز کنید."
      />
    );
  return (
    <div className="visit-summary">
      <Badge tone="accent">همراه شما تا فروشگاه</Badge>
      <h2>برنامهٔ خرید شما</h2>
      <div className="visit-product">
        {product ? (
          <div className="visit-photo">
            <ProductImage
              src={safeUrl(product.images[0])}
              title={product.title}
            />
          </div>
        ) : (
          <ShoppingBag />
        )}
        <div>
          <h3 dir="auto">{product?.title || offer.title}</h3>
          <span className="eyebrow">قدم اول · انتخاب شما</span>
          <strong>
            {money(offer.price)} {offer.price !== null ? "تومان" : ""}
          </strong>
          <PriceFreshness offer={offer} />
        </div>
      </div>
      {product && (
        <div className="visit-specs">
          {product.specs.slice(0, 6).map((spec, i) => (
            <div key={i}>
              <span>{spec.key}</span>
              <strong dir="auto">{spec.value}</strong>
            </div>
          ))}
          <details>
            <summary>تمام مشخصات کالا</summary>
            <ProductSpecs product={product} />
          </details>
        </div>
      )}
      <div className="visit-receipt">
        <div>
          <small>تعداد کالا</small>
          <div className="quantity-control">
            <Button
              aria-label="کاهش تعداد"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </Button>
            <strong>{fa(quantity)}</strong>
            <Button
              aria-label="افزایش تعداد"
              disabled={quantity >= 99}
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            >
              +
            </Button>
          </div>
        </div>
        <div>
          <small>جمع مبلغ ثبت‌شده</small>
          <strong>
            {money(offer.price === null ? null : offer.price * quantity)}{" "}
            {offer.price !== null ? "تومان" : ""}
          </strong>
          <small>قیمت نهایی در فروشگاه تأیید می‌شود</small>
        </div>
      </div>
      <h3>{shop.name}</h3>
      <StoreLocationDetails shop={shop} />
      <AvailabilityUnverifiedNotice />
      <StoreHours shop={shop} />
      <RoutePreview shop={shop} />
      <VisitTiming shop={shop} departure={departure} onChange={setDeparture} />
      <PurchaseOutcome offer={offer} replan />
      <VisitChecklist checks={checks} onChange={setChecks} />
      <Button
        variant="primary"
        onClick={() => {
          set({
            plans: [
              ...s.plans.filter((p) => p.offerId !== offer.id),
              {
                id: plan?.id || crypto.randomUUID(),
                offerId: offer.id,
                createdAt: new Date().toISOString(),
                checks,
                quantity,
                departure,
              },
            ],
          });
          uiEvents.emit({ type: "visit.save", payload: { offerId: offer.id } });
        }}
      >
        <Bookmark size={16} />
        {plan ? "به‌روزرسانی برنامهٔ ذخیره‌شده" : "ذخیرهٔ برنامهٔ مراجعه"}
      </Button>
      <StoreInquiryDraft product={product} offer={offer} />
    </div>
  );
}
export function EmptyResultsAndRelaxFilters() {
  const filter = useStore((s) => s.filter);
  return (
    <EmptyState
      title="در داده‌های ما نتیجه‌ای پیدا نشد"
      description="فروشگاه‌ها و کالاهای این مجموعه کامل نیستند. با انتخاب دکمهٔ زیر محدودیت‌ها برداشته می‌شوند."
      action={
        <Button
          onClick={() =>
            filter({
              query: "",
              category: "",
              min: "",
              max: "",
              nearby: false,
              priceStatus: "all",
              bounds: undefined,
              shop: undefined,
              payment: "",
              inPersonOnly: false,
              warranty: false,
            })
          }
        >
          حذف فیلترها و جست‌وجوی دوباره
        </Button>
      }
    />
  );
}
