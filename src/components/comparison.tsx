import { useState } from "react";
import {
  Car,
  Footprints,
  GitCompareArrows,
  MapPin,
  Sparkles,
  Store,
  X,
  ArrowUpLeft,
} from "lucide-react";
import { useStore } from "../state/store";
import type { Product, Offer, Shop } from "../data/types";
import { fa, money, haversine } from "../i18n/format";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  ProductImage,
} from "./primitives";
import {
  PriceFreshness,
  WarrantyDetails,
  PaymentMethodBadges,
} from "./commerce";
import {
  candidates,
  groupOffers,
  normalizeFeature,
  type Candidate,
} from "../features/comparison/decision";
import { useTravelRoutes } from "../features/maps/travel";
import { travelTime } from "../features/maps/RoutePreview";
export function CompareTray({ onCompare }: { onCompare?: () => void } = {}) {
  const { session: s, set, toggleCompare } = useStore();
  return s.compare.length ? (
    <div className="compare-tray">
      <span>
        <GitCompareArrows size={18} />
        {fa(s.compare.length)} کالا برای مقایسه
      </span>
      <div className="compare-mini">
        {s.compare.map((id) => (
          <div key={id} className="compare-selection">
            <ProductImage
              src={s.entities.products[id]?.images[0]}
              title={s.entities.products[id]?.title || "کالا"}
            />
            <span title={s.entities.products[id]?.title}>
              {s.entities.products[id]?.title || "کالا"}
            </span>
            <IconButton
              label={"حذف " + (s.entities.products[id]?.title || "کالا")}
              onClick={() => toggleCompare(id)}
            >
              <X size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        variant="primary"
        onClick={onCompare || (() => set({ scene: "compare" }))}
      >
        مقایسه کن
      </Button>
    </div>
  ) : null;
}
export function ProductComparison({
  products,
  offers,
}: {
  products: Product[];
  offers: Offer[];
}) {
  const [differences, setDifferences] = useState(false);
  if (!products.length)
    return (
      <EmptyState
        title="کالاهای مقایسه را انتخاب کنید"
        description="با دکمهٔ مقایسه روی کارت‌ها، تا چهار کالا اضافه کنید."
      />
    );
  const features = new Map<string, { key: string; section: string }>();
  for (const p of products)
    for (const spec of p.specs) {
      const id =
        normalizeFeature(spec.section || "مشخصات") +
        "::" +
        normalizeFeature(spec.key);
      if (!features.has(id))
        features.set(id, { key: spec.key, section: spec.section || "مشخصات" });
    }
  const prices = products.map((p) =>
    offers
      .filter((o) => o.productId === p.id && o.price !== null)
      .map((o) => o.price!),
  );
  const minimums = prices.map((a) => (a.length ? Math.min(...a) : null));
  const cheapest = Math.min(...minimums.filter((n): n is number => n !== null));
  const highest = Math.max(
    1,
    ...minimums.filter((n): n is number => n !== null),
  );
  const rows = [...features.values()].map((f) => ({
    ...f,
    values: products.map(
      (p) =>
        p.specs.find(
          (s) =>
            normalizeFeature(s.key) === normalizeFeature(f.key) &&
            normalizeFeature(s.section || "مشخصات") ===
              normalizeFeature(f.section),
        )?.value || "ثبت نشده",
    ),
  }));
  const visible = rows.filter(
    (row) => !differences || new Set(row.values.map(normalizeFeature)).size > 1,
  );
  let section = "";
  return (
    <section className="product-comparison">
      <div className="comparison-intro">
        <div>
          <span className="eyebrow">جزئیات، کنار هم</span>
          <h3>کدام کالا به نیاز شما نزدیک‌تر است؟</h3>
        </div>
        <button
          className={"difference-toggle " + (differences ? "active" : "")}
          aria-pressed={differences}
          onClick={() => setDifferences(!differences)}
        >
          فقط تفاوت‌ها
        </button>
      </div>
      <div className="comparison-scroll">
        <table className="comparison-table rich-comparison">
          <caption>مقایسهٔ مشخصات و قیمت کالاها</caption>
          <thead>
            <tr>
              <th scope="col">کالا</th>
              {products.map((p, i) => (
                <th scope="col" key={p.id}>
                  <span className={"comparison-product-number tone-" + i}>
                    {fa(i + 1)}
                  </span>
                  <ProductImage src={p.images[0]} title="" />
                  <strong dir="auto">{p.title}</strong>
                  <small>{p.category}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="comparison-group">
              <th colSpan={products.length + 1}>قیمت و فروشندگان</th>
            </tr>
            <tr>
              <th scope="row">کمترین قیمت</th>
              {products.map((p, i) => (
                <td key={p.id}>
                  <strong
                    className={minimums[i] === cheapest ? "best-price" : ""}
                  >
                    {money(minimums[i])}
                  </strong>
                  {minimums[i] !== null && <small> تومان</small>}
                  <span
                    className="comparison-bar"
                    style={{
                      width:
                        minimums[i] === null
                          ? 0
                          : `${(minimums[i]! / highest) * 100}%`,
                    }}
                  />
                  {minimums[i] === cheapest && (
                    <Badge tone="success">کمترین قیمت این مقایسه</Badge>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">تعداد فروشندگان</th>
              {products.map((p) => (
                <td key={p.id}>
                  {fa(
                    new Set(
                      offers
                        .filter((o) => o.productId === p.id)
                        .map((o) => o.shopId),
                    ).size,
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">برند</th>
              {products.map((p) => (
                <td key={p.id}>{p.brand || "ثبت نشده"}</td>
              ))}
            </tr>
            {visible.map((row, i) => {
              const header = section !== row.section;
              section = row.section;
              const different =
                new Set(row.values.map(normalizeFeature)).size > 1;
              return (
                <FragmentRow
                  key={row.section + row.key}
                  section={header ? row.section : null}
                  label={row.key}
                  values={row.values}
                  different={different}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {differences && !visible.length && (
        <p className="muted small">تفاوت دیگری در مشخصات ثبت‌شده پیدا نشد.</p>
      )}
    </section>
  );
}
function FragmentRow({
  section,
  label,
  values,
  different,
}: {
  section: string | null;
  label: string;
  values: string[];
  different: boolean;
}) {
  return (
    <>
      {section && (
        <tr className="comparison-group">
          <th colSpan={values.length + 1}>{section}</th>
        </tr>
      )}
      <tr className={different ? "different-row" : ""}>
        <th scope="row">{label}</th>
        {values.map((v, i) => (
          <td key={i} dir="auto">
            {label.includes("رنگ") && <ColorSwatch text={v} />}
            <span>{v}</span>
          </td>
        ))}
      </tr>
    </>
  );
}
function ColorSwatch({ text }: { text: string }) {
  const colors: Record<string, string> = {
    مشکی: "#282c32",
    سفید: "#fff",
    آبی: "#558ed2",
    قرمز: "#d85e56",
    سبز: "#608974",
    طلایی: "#c4a16a",
    نقره: "#abb4bf",
    صورتی: "#e6a8ba",
  };
  const color = Object.entries(colors).find(([name]) => text.includes(name));
  return color ? (
    <i className="color-swatch" style={{ background: color[1] }} />
  ) : null;
}
export function SellerComparison({
  offers,
  shops,
  onVisit,
}: {
  offers: Offer[];
  shops: Shop[];
  onVisit: (o: Offer) => void;
}) {
  const s = useStore((x) => x.session);
  const productIds = [...new Set(offers.map((o) => o.productId))];
  const [chosen, setChosen] = useState<string | null>(null);
  const selected =
    productIds.length === 1
      ? productIds[0]
      : chosen && productIds.includes(chosen)
        ? chosen
        : null;
  if (!offers.length)
    return <EmptyState title="ابتدا فروشندگان یک محصول را باز کنید" />;
  if (!selected)
    return (
      <section className="seller-product-picker">
        <h3>فروشندگان کدام کالا را مقایسه کنیم؟</h3>
        <p className="muted small">
          برای مقایسهٔ قیمت و مسیر، یک کالای یکسان انتخاب کنید.
        </p>
        <div className="seller-product-options">
          {productIds.map((id) => {
            const p = s.entities.products[id];
            return (
              <button
                key={id}
                onClick={() => {
                  setChosen(id);
                  useStore.getState().set({ selectedProduct: id });
                }}
              >
                <ProductImage src={p?.images[0]} title="" />
                <span dir="auto">
                  {p?.title ||
                    offers.find((o) => o.productId === id)?.title ||
                    "کالا"}
                </span>
                <ArrowUpLeft size={16} />
              </button>
            );
          })}
        </div>
      </section>
    );
  const groups = groupOffers(offers.filter((o) => o.productId === selected));
  const p = s.entities.products[selected];
  return (
    <section>
      <div className="seller-product-heading">
        {p && <ProductImage src={p.images[0]} title="" />}
        <div>
          <span className="eyebrow">یک کالا، چند مسیر برای خرید</span>
          <h3 dir="auto">
            {p?.title || offers.find((o) => o.productId === selected)?.title}
          </h3>
          <small>{fa(groups.length)} فروشگاه</small>
        </div>
      </div>
      <div className="seller-comparison">
        {groups.map((group) => (
          <SellerGroup
            key={group[0].productId + group[0].shopId}
            group={group}
            shop={shops.find((s) => s.id === group[0].shopId)}
            onVisit={onVisit}
          />
        ))}
      </div>
    </section>
  );
}
function SellerGroup({
  group,
  shop,
  onVisit,
}: {
  group: Offer[];
  shop?: Shop;
  onVisit: (o: Offer) => void;
}) {
  const loc = useStore((s) => s.session.location);
  const routes = useTravelRoutes(shop);
  const offer = group[0];
  return (
    <article className="seller-group">
      <div className="seller-store-title">
        <span className="store-avatar">
          <Store size={20} />
        </span>
        <h3>{shop?.name || "فروشگاه نامشخص"}</h3>
      </div>
      <strong className="seller-price">
        {money(offer.price)}
        {offer.price !== null && <small> تومان</small>}
      </strong>
      {group.length > 1 && (
        <small className="muted">
          از {fa(group.length)} آفر برای همین کالا
        </small>
      )}
      <p className="muted small">
        {loc && shop?.lat != null && shop.lon !== null
          ? fa(haversine(loc, { lat: shop.lat, lon: shop.lon })) +
            " کیلومتر مستقیم"
          : shop?.area || "موقعیت را انتخاب کنید"}
      </p>
      <div className="seller-travel">
        <span>
          <Car size={16} />
          {routes.busy
            ? "محاسبه…"
            : routes.driving
              ? travelTime(routes.driving.durationSeconds)
              : "زمان خودرو"}
          {routes.driving && (
            <small>{fa(routes.driving.distanceMeters / 1000)} کیلومتر</small>
          )}
        </span>
        <span>
          <Footprints size={16} />
          {routes.busy
            ? "محاسبه…"
            : routes.walking
              ? travelTime(routes.walking.durationSeconds)
              : "زمان پیاده"}
          {routes.walking && (
            <small>{fa(routes.walking.distanceMeters / 1000)} کیلومتر</small>
          )}
        </span>
      </div>
      {!routes.driving && !routes.walking && (
        <Button disabled={!loc || routes.busy} onClick={routes.calculate}>
          {routes.attempted ? "تلاش دوبارهٔ مسیریابی" : "محاسبهٔ هر دو مسیر"}
        </Button>
      )}
      <PriceFreshness offer={offer} />
      <WarrantyDetails offer={offer} />
      {shop && (
        <>
          <PaymentMethodBadges shop={shop} />
          <small className="seller-address">
            {shop.address || "آدرس ثبت نشده"}
          </small>
        </>
      )}
      {group.length > 1 && (
        <details className="offer-variants">
          <summary>دیدن آفرهای این فروشگاه</summary>
          {group.map((o) => (
            <div key={o.id}>
              <strong>{money(o.price)} تومان</strong>
              <p dir="auto">{o.title}</p>
              <PriceFreshness offer={o} />
              <WarrantyDetails offer={o} />
              <Button onClick={() => onVisit(o)}>انتخاب این آفر</Button>
            </div>
          ))}
        </details>
      )}
      <Button variant="primary" onClick={() => onVisit(offer)}>
        انتخاب برای مراجعه
        <ArrowUpLeft size={15} />
      </Button>
    </article>
  );
}
export function PrioritySelector() {
  const { session: s, set } = useStore();
  return (
    <div className="segmented">
      {(
        [
          ["price", "قیمت کمتر"],
          ["distance", "نزدیک‌تر"],
          ["balance", "متعادل"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          aria-pressed={s.priority === v}
          className={s.priority === v ? "active" : ""}
          onClick={() => set({ priority: v })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
export function PriceVsDistancePlot({
  offers,
  shops,
}: {
  offers: Offer[];
  shops: Shop[];
}) {
  const s = useStore((x) => x.session);
  const list = candidates(offers, shops, s.entities.products, s.location);
  const [hover, setHover] = useState<string | null>(null);
  const [frontierOnly, setFrontierOnly] = useState(false);
  const [logarithmic, setLogarithmic] = useState(true);
  const selected =
    list.find((x) => x.offer.id === (hover || s.selectedOffer)) ||
    list.find((x) => x.pareto) ||
    list[0];
  if (!list.length)
    return <EmptyState title="برای مقایسهٔ فاصله، موقعیت را انتخاب کنید" />;
  const shown = frontierOnly ? list.filter((x) => x.pareto) : list;
  const maxP = Math.max(...list.map((v) => v.offer.price!), 1) * 1.05,
    maxD = Math.max(...list.map((v) => v.distance), 0.1) * 1.08;
  const referenceP = Math.max(
    1,
    Math.min(...list.map((x) => x.offer.price!).filter((x) => x > 0)) * 0.1,
  );
  const scale = (n: number, max: number, ref: number) =>
    logarithmic ? Math.log1p(n / ref) / Math.log1p(max / ref) : n / max;
  const invert = (t: number, max: number, ref: number) =>
    logarithmic ? ref * Math.expm1(t * Math.log1p(max / ref)) : max * t;
  const point = (c: Candidate) => ({
    x: 85 + scale(c.distance, maxD, 0.05) * 460,
    y: 245 - scale(c.offer.price!, maxP, referenceP) * 205,
  });
  const pareto = list
    .filter((x) => x.pareto)
    .sort((a, b) => a.distance - b.distance);
  const choose = (c: Candidate) => {
    useStore
      .getState()
      .set({ selectedOffer: c.offer.id, selectedShop: c.shop.id });
  };
  return (
    <section className="decision-plot interactive-pareto">
      <div className="plot-heading">
        <div>
          <span className="eyebrow">نقشهٔ تصمیم شما</span>
          <h3>هر نقطه، یک پیشنهاد مشخص</h3>
        </div>
        <button
          className={"difference-toggle " + (frontierOnly ? "active" : "")}
          aria-pressed={frontierOnly}
          onClick={() => setFrontierOnly(!frontierOnly)}
        >
          فقط گزینه‌های پارتو
        </button>
      </div>
      <div className="plot-axis-caption">
        <span>قیمت · تومان ↑</span>
        <button
          className="plot-scale"
          aria-pressed={logarithmic}
          onClick={() => setLogarithmic(!logarithmic)}
        >
          {logarithmic ? "مقیاس لگاریتمی" : "مقیاس خطی"}
        </button>
        <span>↙ نزدیک‌تر و ارزان‌تر</span>
      </div>
      {selected && (
        <div className="plot-inspector" aria-live="polite">
          <strong>
            گزینهٔ {fa(selected.number)} · {selected.shop.name}
          </strong>
          <span dir="auto">
            {selected.product?.title || selected.offer.title}
          </span>
          <small>
            {money(selected.offer.price)} تومان · {fa(selected.distance)}{" "}
            کیلومتر مستقیم
          </small>
        </div>
      )}
      <svg
        viewBox="0 0 580 290"
        role="group"
        aria-label="نمودار تعاملی قیمت و فاصلهٔ پیشنهادها"
      >
        <path
          d="M85 25V245H560"
          fill="none"
          stroke="currentColor"
          opacity=".25"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <path
              d={`M85 ${245 - t * 205}H560`}
              stroke="currentColor"
              opacity=".07"
            />
            <text
              x="76"
              y={249 - t * 205}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
            >
              {compactPrice(invert(t, maxP, referenceP))}
            </text>
            <text
              x={85 + t * 460}
              y="267"
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {fa(invert(t, maxD, 0.05))}
            </text>
          </g>
        ))}
        <polyline
          points={pareto
            .map((c) => {
              const p = point(c);
              return p.x + "," + p.y;
            })
            .join(" ")}
          stroke="#528b78"
          strokeWidth="2"
          strokeDasharray="4 4"
          fill="none"
        />
        {shown.map((c) => {
          const p = point(c);
          const active = selected?.offer.id === c.offer.id;
          return (
            <g
              key={c.offer.id}
              role="button"
              tabIndex={0}
              aria-label={`گزینه ${fa(c.number)}: ${c.product?.title || c.offer.title}، ${c.shop.name}، ${money(c.offer.price)} تومان`}
              aria-pressed={s.selectedOffer === c.offer.id}
              onMouseEnter={() => setHover(c.offer.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.offer.id)}
              onBlur={() => setHover(null)}
              onClick={() => choose(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  choose(c);
                }
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={active ? 16 : 13}
                fill={active ? "#d83c2b" : c.pareto ? "#427e68" : "#81969f"}
                stroke="var(--surface)"
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fill="#fff"
                fontSize="10"
                fontWeight="600"
                pointerEvents="none"
              >
                {fa(c.number)}
              </text>
              <title>
                {c.product?.title || c.offer.title} · {c.shop.name}
              </title>
            </g>
          );
        })}
        {selected && (
          <g aria-hidden="true" pointerEvents="none">
            <circle
              cx={point(selected).x}
              cy={point(selected).y}
              r="16"
              fill="#d83c2b"
              stroke="var(--surface)"
              strokeWidth="2"
            />
            <text
              x={point(selected).x}
              y={point(selected).y + 4}
              textAnchor="middle"
              fill="#fff"
              fontSize="10"
              fontWeight="600"
            >
              {fa(selected.number)}
            </text>
          </g>
        )}
      </svg>
      <div className="plot-axis-footer">
        <span>
          <i />
          خط پارتو: گزینه‌ای هم ارزان‌تر و هم نزدیک‌تر وجود ندارد
        </span>
        <span>فاصلهٔ مستقیم · کیلومتر →</span>
      </div>
      {selected && (
        <div className="selected-candidate">
          <span className="candidate-number">{fa(selected.number)}</span>
          <ProductImage src={selected.product?.images[0]} title="" />
          <div>
            <h4 dir="auto">
              {selected.product?.title || selected.offer.title}
            </h4>
            <p>
              {selected.shop.name} · {fa(selected.distance)} کیلومتر مستقیم
            </p>
            <strong>{money(selected.offer.price)} تومان</strong>
          </div>
          <Button
            onClick={() => {
              choose(selected);
              useStore.getState().set({
                selectedProduct: selected.offer.productId,
                scene: "visit",
              });
            }}
          >
            برنامهٔ خرید
            <ArrowUpLeft size={14} />
          </Button>
        </div>
      )}
      <div className="plot-legend" aria-label="راهنمای گزینه‌های نمودار">
        {shown.map((c) => (
          <button
            key={c.offer.id}
            className={selected?.offer.id === c.offer.id ? "active" : ""}
            onClick={() => choose(c)}
            onMouseEnter={() => setHover(c.offer.id)}
            onMouseLeave={() => setHover(null)}
          >
            <b>{fa(c.number)}</b>
            <span dir="auto">
              {c.product?.title || c.offer.title}
              <small>
                {c.shop.name} · {money(c.offer.price)} تومان
              </small>
            </span>
            {c.pareto && <Sparkles size={13} />}
          </button>
        ))}
      </div>
    </section>
  );
}
function compactPrice(n: number) {
  return n >= 1000000
    ? fa(n / 1000000) + " میلیون"
    : n >= 1000
      ? fa(n / 1000) + " هزار"
      : fa(n);
}
export function DecisionExplanation() {
  return (
    <details className="decision-method">
      <summary>این پیشنهادها چطور مرتب می‌شوند؟</summary>
      <p>
        قیمت از آفر کالا و فاصلهٔ مستقیم از موقعیت انتخابی شما محاسبه می‌شود.
        پارتو یعنی در همین مجموعه گزینه‌ای وجود ندارد که هم ارزان‌تر و هم
        نزدیک‌تر باشد. در حالت متعادل، قیمت و فاصله پس از تقسیم بر بیشترین
        مقدارشان، سهم برابر دارند.
      </p>
    </details>
  );
}
export function TradeoffCard({
  offers,
  shops,
  onVisit,
}: {
  offers: Offer[];
  shops: Shop[];
  onVisit: (o: Offer) => void;
}) {
  const s = useStore((x) => x.session);
  const list = candidates(offers, shops, s.entities.products, s.location);
  const maxP = Math.max(1, ...list.map((x) => x.offer.price!)),
    maxD = Math.max(1, ...list.map((x) => x.distance));
  const score = (c: Candidate) =>
    s.priority === "price"
      ? c.offer.price!
      : s.priority === "distance"
        ? c.distance
        : c.offer.price! / maxP + c.distance / maxD;
  const sorted = [...list].sort((a, b) => score(a) - score(b));
  return (
    <>
      <DecisionExplanation />
      <div className="ranked-candidates">
        {sorted.slice(0, 8).map((c, i) => (
          <article
            key={c.offer.id}
            className={s.selectedOffer === c.offer.id ? "selected" : ""}
          >
            <span className="rank-number">{fa(i + 1)}</span>
            <div>
              <h3 dir="auto">{c.product?.title || c.offer.title}</h3>
              <p>
                {c.shop.name} · {fa(c.distance)} کیلومتر مستقیم
              </p>
            </div>
            <strong>
              {money(c.offer.price)}
              <small> تومان</small>
            </strong>
            <Button onClick={() => onVisit(c.offer)}>انتخاب برای مراجعه</Button>
          </article>
        ))}
      </div>
    </>
  );
}
