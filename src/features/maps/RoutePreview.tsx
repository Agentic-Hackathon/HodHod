import { lazy, Suspense, useState } from "react";
import { Car, Footprints, Navigation, RefreshCw } from "lucide-react";
import type { Shop } from "../../data/types";
import { useStore } from "../../state/store";
import type { TravelMode } from "./routing";
import { useTravelRoutes, type TravelRoute } from "./travel";
import { Button } from "../../components/primitives";
import { DirectionsAction } from "../../components/commerce";
import { fa } from "../../i18n/format";
const RouteMap = lazy(() => import("./RouteMap"));
export function travelTime(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60
    ? `${fa(Math.floor(minutes / 60))} ساعت${minutes % 60 ? ` و ${fa(minutes % 60)} دقیقه` : ""}`
    : `${fa(minutes)} دقیقه`;
}
export function RoutePreview({
  shop,
  onModeChange,
}: {
  shop: Shop;
  onModeChange?: (mode: TravelMode) => void;
}) {
  const location = useStore((s) => s.session.location);
  const [mode, setMode] = useState<TravelMode>("driving");
  const routes = useTravelRoutes(shop, true);
  const route = routes[mode];
  const set = useStore((s) => s.set);
  return (
    <section className="travel-planner">
      <div className="section-heading">
        <div>
          <span className="eyebrow">قدم دوم · مسیر شما</span>
          <h3>چطور به فروشگاه برویم؟</h3>
        </div>
        {routes.attempted && (
          <Button variant="ghost" onClick={routes.calculate}>
            <RefreshCw size={15} />
            تازه‌سازی
          </Button>
        )}
      </div>
      {location ? (
        <p className="travel-origin">
          <Navigation size={15} />
          {location.label}
          <span>←</span>
          {shop.name}
        </p>
      ) : (
        <div className="route-location">
          <p>مبدأ را انتخاب کنید تا مسیر هر دو روش محاسبه شود.</p>
          <div className="neighborhoods">
            {[
              { label: "جمهوری", lat: 35.6953, lon: 51.4107 },
              { label: "ونک", lat: 35.757, lon: 51.409 },
            ].map((p) => (
              <Button key={p.label} onClick={() => set({ location: p })}>
                {p.label}
              </Button>
            ))}
            <Button
              onClick={() =>
                navigator.geolocation?.getCurrentPosition((p) =>
                  set({
                    location: {
                      lat: p.coords.latitude,
                      lon: p.coords.longitude,
                      label: "موقعیت من",
                    },
                  }),
                )
              }
            >
              موقعیت من
            </Button>
          </div>
        </div>
      )}
      <div className="travel-modes">
        {(["driving", "walking"] as const).map((m) => {
          const Icon = m === "driving" ? Car : Footprints;
          const r = routes[m];
          return (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                onModeChange?.(m);
              }}
            >
              <Icon size={23} />
              <span>
                {m === "driving" ? "با خودرو" : "پیاده"}
                <strong>
                  {routes.busy
                    ? "در حال محاسبه…"
                    : r
                      ? travelTime(r.durationSeconds)
                      : location
                        ? "مسیر دریافت نشد"
                        : "مبدأ را انتخاب کنید"}
                </strong>
                <small>
                  {r ? `${fa(r.distanceMeters / 1000)} کیلومتر مسیر` : ""}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {route && (
        <>
          <Suspense fallback={<div className="route-map skeleton" />}>
            <RouteMap route={route} />
          </Suspense>
          <div className="route-steps">
            <h4>راهنمای مسیر {mode === "walking" ? "پیاده" : "خودرو"}</h4>
            <ol>
              {route.steps.map((step, i) => (
                <li key={i}>
                  <span>{fa(i + 1)}</span>
                  <div>
                    {instruction(step)}
                    {step.distance > 0 && (
                      <small>
                        {step.distance < 1000
                          ? `${fa(Math.round(step.distance))} متر`
                          : `${fa(step.distance / 1000)} کیلومتر`}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      {routes.attempted && !routes.busy && !route && location && (
        <p className="small muted">
          دریافت مسیر ممکن نشد. دوباره تلاش کنید یا مسیریاب را باز کنید.
        </p>
      )}
      <div className="route-footer">
        <DirectionsAction shop={shop} />
        <small>
          زمان تخمینی، بدون ترافیک زنده ·{" "}
          <a
            href="https://routing.openstreetmap.de/about.html"
            target="_blank"
            rel="noreferrer"
          >
            OSRM / OSM
          </a>{" "}
          ·{" "}
          <a
            href="https://www.openstreetmap.org/fixthemap"
            target="_blank"
            rel="noreferrer"
          >
            اصلاح نقشه
          </a>
        </small>
      </div>
    </section>
  );
}
function instruction(step: TravelRoute["steps"][number]) {
  const directions: Record<string, string> = {
    right: "به راست",
    left: "به چپ",
    "slight right": "کمی به راست",
    "slight left": "کمی به چپ",
    "sharp right": "به تندی به راست",
    "sharp left": "به تندی به چپ",
    straight: "مستقیم",
    uturn: "دور بزنید",
  };
  if (step.type === "arrive") return "به مقصد رسیدید";
  if (step.type === "depart")
    return `حرکت را ${step.name ? "در " + step.name : "از مبدأ"} شروع کنید`;
  return `${directions[step.modifier] || "ادامه دهید"}${step.name ? "؛ " + step.name : ""}`;
}
