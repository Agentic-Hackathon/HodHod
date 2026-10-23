import { lazy, Suspense, useState } from "react";
import type { Offer, Product, Shop } from "../data/types";
import { useStore } from "../state/store";
import { fa, haversine, money } from "../i18n/format";
import { Button, EmptyState, ProductImage } from "./primitives";
import {
  ProductComparison,
  SellerComparison,
  PriceVsDistancePlot,
  PrioritySelector,
  TradeoffCard,
} from "./comparison";
import { RoutePreview } from "../features/maps/RoutePreview";
const ContextMap = lazy(() =>
  import("../features/maps/ContextMap").then((m) => ({
    default: m.ContextMap,
  })),
);

export function ComparisonWorkspace({
  products,
  offers,
  shops,
  mode,
  onMode,
  onVisit,
  onLocation,
}: {
  products: Product[];
  offers: Offer[];
  shops: Shop[];
  mode: "products" | "sellers";
  onMode: (mode: "products" | "sellers") => void;
  onVisit: (offer: Offer) => void;
  onLocation: () => void;
}) {
  const { session: s, set } = useStore();
  const [routeShop, setRouteShop] = useState<string | null>(null);
  const ids = new Set(products.map((p) => p.id));
  const productOffers = offers.filter((o) => ids.has(o.productId));
  const sellerIds = [...new Set(offers.map((o) => o.productId))];
  const sellerId =
    sellerIds.length === 1
      ? sellerIds[0]
      : sellerIds.includes(s.selectedProduct || "")
        ? s.selectedProduct
        : null;
  const scope =
    mode === "products"
      ? productOffers
      : sellerId
        ? offers.filter((o) => o.productId === sellerId)
        : [];
  const shopIds = new Set(scope.map((o) => o.shopId));
  const scopeShops = shops.filter((sh) => shopIds.has(sh.id));
  const mappedShops = scopeShops.filter(
    (sh) => sh.lat != null && sh.lon != null,
  );
  const route = scopeShops.find((sh) => sh.id === routeShop);
  const missing = scope.filter((o) => o.price === null).length;
  return (
    <section className="comparison-workspace">
      <h2>مقایسه و تصمیم‌یار خرید</h2>
      <div className="segmented" role="group" aria-label="نوع مقایسه">
        <button
          className={mode === "products" ? "active" : ""}
          aria-pressed={mode === "products"}
          onClick={() => onMode("products")}
        >
          مقایسهٔ کالاها
        </button>
        <button
          className={mode === "sellers" ? "active" : ""}
          aria-pressed={mode === "sellers"}
          onClick={() => onMode("sellers")}
        >
          مقایسهٔ فروشندگان یک کالا
        </button>
      </div>
      {mode === "sellers" && sellerIds.length > 1 && sellerId && (
        <label className="field seller-scope">
          کالای مورد مقایسه
          <select
            value={sellerId || ""}
            onChange={(e) => {
              set({ selectedProduct: e.target.value });
              setRouteShop(null);
            }}
          >
            <option value="">یک کالا انتخاب کنید</option>
            {sellerIds.map((id) => (
              <option key={id} value={id}>
                {s.entities.products[id]?.title || id}
              </option>
            ))}
          </select>
        </label>
      )}
      {!scope.length ? (
        mode === "sellers" && sellerIds.length > 1 ? (
          <SellerComparison offers={offers} shops={shops} onVisit={onVisit} />
        ) : (
          <EmptyState
            title={
              mode === "products"
                ? "کالاهای مقایسه را انتخاب کنید"
                : "یک کالا برای مقایسهٔ فروشگاه‌ها انتخاب کنید"
            }
            description="از دکمهٔ مقایسه روی کارت کالا استفاده کنید."
          />
        )
      ) : (
        <>
          <nav className="comparison-sections" aria-label="بخش‌های مقایسه">
            <a href="#comparison-specs">۱. ویژگی‌ها و قیمت</a>
            <a href="#comparison-geography">۲. فروشگاه‌ها و فاصله</a>
            <a href="#comparison-decision">۳. انتخاب و پارتو</a>
          </nav>
          <section id="comparison-specs">
            {mode === "products" ? (
              <ProductComparison products={products} offers={scope} />
            ) : (
              <SellerComparison
                key={sellerId}
                offers={scope}
                shops={scopeShops}
                onVisit={onVisit}
              />
            )}
          </section>
          <section id="comparison-geography" className="comparison-geography">
            <div className="section-heading">
              <h3>فروشگاه‌ها نسبت به شما کجا هستند؟</h3>
              <Button onClick={onLocation}>
                {s.location?.label || "انتخاب مبدأ مقایسه"}
              </Button>
            </div>
            <small>
              {fa(mappedShops.length)} فروشگاه روی نقشه
              {scopeShops.length > mappedShops.length
                ? ` · ${fa(scopeShops.length - mappedShops.length)} فروشگاه بدون مختصات`
                : ""}
            </small>
            <Suspense fallback={<p>در حال آماده‌سازی نقشه…</p>}>
              <ContextMap
                origin={s.location}
                radius={s.filters.nearby ? s.filters.radius : undefined}
                shops={mappedShops}
                selectedShop={s.selectedShop}
                onSelect={(shop) => {
                  const offer = scope.find((o) => o.shopId === shop.id);
                  set({
                    selectedShop: shop.id,
                    selectedOffer: offer?.id || null,
                  });
                  setRouteShop(shop.id);
                }}
              />
            </Suspense>
            <div className="comparison-distance-list">
              {scopeShops.map((shop) => {
                const rows = scope.filter((o) => o.shopId === shop.id);
                const number =
                  mappedShops.findIndex((sh) => sh.id === shop.id) + 1;
                return (
                  <article
                    className={`comparison-store ${s.selectedShop === shop.id ? "selected" : ""}`}
                    key={shop.id}
                  >
                    <h4>
                      <span className="store-number">
                        {number ? fa(number) : "—"}
                      </span>
                      {shop.name}
                    </h4>
                    <strong>
                      {s.location && shop.lat != null && shop.lon != null
                        ? `${fa(Math.round(haversine(s.location, { lat: shop.lat, lon: shop.lon }) * 100) / 100)} کیلومتر فاصلهٔ مستقیم`
                        : "فاصله نامشخص"}
                    </strong>
                    {rows.map((o) => {
                      const p = s.entities.products[o.productId];
                      return (
                        <div className="comparison-store-offer" key={o.id}>
                          <ProductImage
                            src={p?.images[0]}
                            title={p?.title || o.title || "کالا"}
                          />
                          <span dir="auto">
                            {p?.title || o.title}
                            <b>
                              {money(o.price)}
                              {o.price !== null ? " تومان" : ""}
                            </b>
                          </span>
                          <Button onClick={() => onVisit(o)}>
                            انتخاب خرید
                          </Button>
                        </div>
                      );
                    })}
                    <Button
                      aria-pressed={routeShop === shop.id}
                      onClick={() => {
                        set({ selectedShop: shop.id });
                        setRouteShop(routeShop === shop.id ? null : shop.id);
                      }}
                    >
                      مسیر پیاده و خودرو
                    </Button>
                  </article>
                );
              })}
            </div>
            {route && <RoutePreview key={route.id} shop={route} />}
          </section>
          <section id="comparison-decision">
            <h3>کدام انتخاب برای شما بهتر است؟</h3>
            <PrioritySelector />
            {missing > 0 && (
              <p className="comparison-missing">
                {fa(missing)} پیشنهاد با قیمت نامشخص در جدول و نقشه دیده
                می‌شوند؛ محاسبهٔ پارتو به قیمت نیاز دارد.
              </p>
            )}
            <PriceVsDistancePlot offers={scope} shops={scopeShops} />
            <TradeoffCard offers={scope} shops={scopeShops} onVisit={onVisit} />
          </section>
        </>
      )}
    </section>
  );
}
