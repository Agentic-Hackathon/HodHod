import { lazy, Suspense, useEffect, useState } from "react";
const ContextMap = lazy(() =>
  import("../features/maps/ContextMap").then((m) => ({
    default: m.ContextMap,
  })),
);
import { BudgetPicker } from "./BudgetPicker";
import type { Filters } from "../data/types";
import { api } from "../data/api";
import {
  ArrowUpLeft,
  Camera,
  Clock3,
  ChevronLeft,
  Compass,
  Headphones,
  MapPin,
  Monitor,
  Search,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  Watch,
  X,
} from "lucide-react";
import { useStore } from "../state/store";
import { uiEvents } from "../state/events";
import { fa } from "../i18n/format";
import { Badge, Button, IconButton } from "./primitives";
export interface Category {
  name: string;
  count: number;
}
export function WelcomeSuggestions({
  onSearch,
  onCategories,
  onLocation,
  onImage,
  onUrgent,
}: {
  onSearch: (q: string) => void;
  onCategories: () => void;
  onLocation: () => void;
  onImage: () => void;
  onUrgent?: () => void;
}) {
  return (
    <section className="welcome">
      <div className="welcome-label">
        <span className="status-dot" />
        همراه شما، از جست‌وجو تا فروشگاه
      </div>
      <div className="welcome-mark">
        <ShoppingMark />
      </div>
      <h1>
        خرید خوب،
        <br />
        <span>از همین نزدیکی شروع می‌شه.</span>
      </h1>
      <p>
        کالای دلخواهت رو پیدا کن، فروشنده‌ها رو مقایسه کن
        <br className="desktop-break" /> و با خیال راحت برای خرید حضوری تصمیم
        بگیر.
      </p>
      <div className="starter-grid">
        <button onClick={() => onSearch("هدفون")}>
          <Headphones />
          <strong>دنبال کالای مشخصی‌ام</strong>
          <small>نام یا مدل کالا را جست‌وجو کن</small>
          <ArrowUpLeft />
        </button>
        <button onClick={onLocation}>
          <MapPin />
          <strong>اطراف من چه خبره؟</strong>
          <small>فروشگاه‌های نزدیک را پیدا کن</small>
          <ArrowUpLeft />
        </button>
        <button onClick={onCategories}>
          <Compass />
          <strong>هنوز تصمیم نگرفتم</strong>
          <small>از دسته‌بندی‌ها شروع کن</small>
          <ArrowUpLeft />
        </button>
        <button onClick={onImage}>
          <Camera />
          <strong>عکسش رو دارم</strong>
          <small>تصویر کالا را پیوست کن</small>
          <ArrowUpLeft />
        </button>
      </div>
      <div className="suggested">
        {onUrgent && (
          <button className="urgent-starter" onClick={onUrgent}>
            <Clock3 size={15} />
            همین امشب لازم دارم
          </button>
        )}
        <span>برای شروع:</span>
        {["هدفون", "گوشی سامسونگ", "کیف مردانه"].map((q) => (
          <button key={q} onClick={() => onSearch(q)}>
            {q}
            <ArrowUpLeft size={13} />
          </button>
        ))}
      </div>
      <div className="welcome-bottom">
        <span>
          <Search size={16} />
          جست‌وجوی واقعی
        </span>
        <span>
          <MapPin size={16} />
          فروشگاه‌های تهران
        </span>
        <span>
          <Sparkles size={16} />
          تصمیم با شما
        </span>
      </div>
    </section>
  );
}
function ShoppingMark() {
  return (
    <svg
      width="68"
      height="68"
      viewBox="0 0 68 68"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 25h28l4 29H16l4-29Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M26 27v-7a8 8 0 0 1 16 0v7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="m28 39 4 4 9-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M52 11v10m-5-5h10M12 32v6m-3-3h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
const icons = [Smartphone, Headphones, Watch, Monitor, Sofa, Shirt];
export function CategoryExplorer({ categories }: { categories: Category[] }) {
  const [q, setQ] = useState("");
  const filter = useStore((s) => s.filter);
  return (
    <section>
      <div className="section-heading">
        <div>
          <Badge tone="accent">کشف کنید</Badge>
          <h2>از کجا شروع کنیم؟</h2>
          <p className="muted">
            دسته‌بندی‌های واقعی کالاها؛ ساختار سلسله‌مراتبی در داده ثبت نشده
            است.
          </p>
        </div>
      </div>
      <label className="search-field">
        <Search size={18} />
        <input
          aria-label="جست‌وجوی دسته‌بندی"
          placeholder="جست‌وجو در دسته‌بندی‌ها"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="category-grid">
        {categories
          .filter((c) => c.name.includes(q))
          .slice(0, 90)
          .map((c, i) => {
            const I = icons[i % icons.length];
            return (
              <button
                key={c.name}
                onClick={() => filter({ category: c.name, query: "" })}
              >
                <span>
                  <I size={24} />
                </span>
                <strong>{c.name}</strong>
                <small>{fa(c.count)} کالا</small>
                <ChevronLeft size={16} />
              </button>
            );
          })}
      </div>
    </section>
  );
}
export function SubcategoryGrid({ categories }: { categories: Category[] }) {
  return <CategoryExplorer categories={categories} />;
}
export function FilterChips({ onLocation }: { onLocation: () => void }) {
  const { session: s, filter } = useStore();
  const f = s.filters;
  return (
    <div className="filter-chips">
      <button onClick={onLocation}>
        <MapPin size={14} />
        {s.location?.label || "انتخاب موقعیت"}
      </button>
      {f.query && (
        <button onClick={() => filter({ query: "" })}>
          {f.query}
          <X size={13} />
        </button>
      )}
      {f.category && (
        <button onClick={() => filter({ category: "" })}>
          {f.category}
          <X size={13} />
        </button>
      )}
      {f.max && (
        <button onClick={() => filter({ max: "" })}>
          تا {fa(Number(f.max))} تومان
          <X size={13} />
        </button>
      )}
      {f.priceStatus && f.priceStatus !== "all" && (
        <button onClick={() => filter({ priceStatus: "all" })}>
          {f.priceStatus === "known" ? "فقط قیمت‌دار" : "فقط قیمت نامشخص"}
          <X size={12} />
        </button>
      )}
      {f.nearby && (
        <button onClick={() => filter({ nearby: false })}>
          شعاع مستقیم {fa(f.radius)} کیلومتر
          <X size={13} />
        </button>
      )}
      {f.bounds && (
        <button onClick={() => filter({ bounds: undefined })}>
          محدودهٔ نقشه
          <X size={13} />
        </button>
      )}
      {f.payment && (
        <button onClick={() => filter({ payment: "" })}>
          {f.payment}
          <X size={13} />
        </button>
      )}
      {f.inPersonOnly && (
        <button onClick={() => filter({ inPersonOnly: false })}>
          پرداخت حضوری ثبت‌شده
          <X size={13} />
        </button>
      )}
      {f.warranty && (
        <button onClick={() => filter({ warranty: false })}>
          توضیح گارانتی ثبت‌شده
          <X size={13} />
        </button>
      )}
    </div>
  );
}
export const ActiveFilters = FilterChips;
export function ProductSearch({ onSubmit }: { onSubmit: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="search-field"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q);
      }}
    >
      <Search size={18} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="نام، برند یا مدل کالا"
        aria-label="جست‌وجوی کالا"
      />
      <IconButton label="جست‌وجو" type="submit">
        <ArrowUpLeft size={18} />
      </IconButton>
    </form>
  );
}
export function SearchResultsHeader({
  total,
  loading,
}: {
  total: number;
  loading: boolean;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>گزینه‌هایی برای خرید شما</h2>
        <p className="muted small" aria-live="polite">
          {loading
            ? "در حال دریافت داده…"
            : fa(total) + " محصول در داده‌های ما"}
        </p>
      </div>
      <Badge>قیمت ثبت‌شده</Badge>
    </div>
  );
}
export function RadiusFilter({
  value,
  onChange,
}: { value?: number; onChange?: (radius: number) => void } = {}) {
  const { session: s, filter } = useStore();
  const radius = value ?? s.filters.radius;
  const change = onChange || ((radius: number) => filter({ radius }));
  return (
    <section className="radius-picker">
      <div className="field-heading">
        <h3>چقدر نزدیک باشه؟</h3>
        <small>شعاع مستقیم</small>
      </div>
      <Suspense fallback={<p>در حال آماده‌سازی نقشه…</p>}>
        <ContextMap origin={s.location} radius={radius} />
      </Suspense>
      <div className="radius-presets">
        {[0.5, 1, 2, 5, 10, 30].map((n) => (
          <button
            type="button"
            key={n}
            aria-pressed={radius === n}
            onClick={() => change(n)}
          >
            {n === 0.5 ? "۵۰۰ متر" : fa(n) + " کیلومتر"}
          </button>
        ))}
      </div>
    </section>
  );
}
export function DynamicForm({ onDone }: { onDone?: () => void }) {
  const { session: s, filter } = useStore();
  const [draft, setDraft] = useState<Filters>({ ...s.filters });
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState("");
  const change = (patch: Partial<Filters>) =>
    setDraft((v) => ({ ...v, ...patch }));
  useEffect(() => {
    api<string[]>("payment-providers")
      .then(setProviders)
      .catch(() => {});
  }, []);
  return (
    <form
      className="dynamic-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.min && draft.max && Number(draft.min) > Number(draft.max)) {
          setError("حداقل بودجه باید کمتر از حداکثر باشد.");
          return;
        }
        filter(draft);
        onDone?.();
      }}
    >
      <section className="price-status-filter">
        <h3>وضعیت قیمت</h3>
        <div className="segmented" role="group" aria-label="وضعیت قیمت">
          {(
            [
              ["all", "همهٔ قیمت‌ها"],
              ["known", "فقط قیمت‌دار"],
              ["unknown", "فقط قیمت نامشخص"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={(draft.priceStatus || "all") === value}
              className={(draft.priceStatus || "all") === value ? "active" : ""}
              onClick={() =>
                change({
                  priceStatus: value,
                  ...(value === "unknown" ? { min: "", max: "" } : {}),
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <BudgetPicker
        value={draft}
        onChange={(patch) =>
          change({
            ...patch,
            priceStatus:
              draft.priceStatus === "unknown" ? "known" : draft.priceStatus,
          })
        }
      />
      <label className="proximity-toggle">
        <span>
          <strong>فروشگاه‌های نزدیک من</strong>
          <small>{s.location?.label || "ابتدا موقعیت را انتخاب کنید"}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          disabled={!s.location}
          checked={draft.nearby}
          onChange={(e) => change({ nearby: e.target.checked })}
        />
      </label>
      <RadiusFilter
        value={draft.radius}
        onChange={(radius) => change({ radius })}
      />
      <details className="more-filters">
        <summary>شرایط پرداخت و گارانتی</summary>
        <label className="field">
          سرویس پرداخت ثبت‌شده
          <select
            value={draft.payment || ""}
            onChange={(e) => change({ payment: e.target.value })}
          >
            <option value="">همهٔ روش‌ها</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!draft.inPersonOnly}
            onChange={(e) => change({ inPersonOnly: e.target.checked })}
          />
          فقط پذیرندگی حضوری ثبت‌شده
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!draft.warranty}
            onChange={(e) => change({ warranty: e.target.checked })}
          />
          دارای توضیح گارانتی ثبت‌شده
        </label>
      </details>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" variant="primary">
        نمایش نتایج
        <ChevronLeft size={16} />
      </Button>
    </form>
  );
}
export function QueryClarification() {
  return (
    <div className="section">
      <Badge tone="accent">کمی دقیق‌تر</Badge>
      <DynamicForm />
    </div>
  );
}
export function LocationPicker({ onDone }: { onDone: () => void }) {
  const { set, session: s, filter } = useStore();
  const [error, setError] = useState("");
  const [lat, setLat] = useState(String(s.location?.lat || 35.7008));
  const [lon, setLon] = useState(String(s.location?.lon || 51.4056));
  const [label, setLabel] = useState(s.location?.label || "نقطهٔ انتخابی");
  const choose = (lat: number, lon: number, label: string) => {
    set({ location: { lat, lon, label } });
    uiEvents.emit({ type: "location.change", payload: { lat, lon, label } });
    filter({ nearby: true, bounds: undefined });
    if (["mission", "compare", "decision", "visit"].includes(s.scene))
      set({ scene: s.scene });
    onDone();
  };
  return (
    <div className="location-picker">
      <p className="muted">
        داده‌ها مربوط به بخش‌هایی از تهران است. موقعیت دقیق فقط با انتخاب شما
        ذخیره می‌شود.
      </p>
      <Button
        onClick={() => {
          if (!navigator.geolocation) {
            setError("موقعیت‌یابی پشتیبانی نمی‌شود؛ انتخاب دستی در دسترس است.");
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (p) => choose(p.coords.latitude, p.coords.longitude, "موقعیت من"),
            () =>
              setError(
                "دسترسی به موقعیت ممکن نشد؛ محله یا مختصات را دستی انتخاب کنید.",
              ),
            { enableHighAccuracy: false, timeout: 10000 },
          );
        }}
      >
        <NavigationIcon />
        استفاده از موقعیت من
      </Button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <h3>یا یک محله را انتخاب کنید</h3>
      <div className="neighborhoods">
        {[
          { label: "جمهوری", lat: 35.6953, lon: 51.4107 },
          { label: "ونک", lat: 35.757, lon: 51.409 },
          { label: "تجریش", lat: 35.8056, lon: 51.429 },
          { label: "صادقیه", lat: 35.721, lon: 51.337 },
        ].map((p) => (
          <Button key={p.label} onClick={() => choose(p.lat, p.lon, p.label)}>
            {p.label}
          </Button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const a = Number(lat),
            b = Number(lon);
          if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            a < -90 ||
            a > 90 ||
            b < -180 ||
            b > 180
          ) {
            setError("مختصات معتبر وارد کنید.");
            return;
          }
          choose(a, b, label);
        }}
      >
        <label className="field">
          نام موقعیت
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </label>
        <div className="two-fields">
          <label className="field">
            عرض جغرافیایی
            <input
              type="number"
              step="any"
              dir="ltr"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
            />
          </label>
          <label className="field">
            طول جغرافیایی
            <input
              type="number"
              step="any"
              dir="ltr"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              required
            />
          </label>
        </div>
        <Button type="submit" variant="primary">
          انتخاب این نقطه
        </Button>
      </form>
    </div>
  );
}
function NavigationIcon() {
  return <MapPin size={16} />;
}
