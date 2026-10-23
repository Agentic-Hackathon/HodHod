import { Car, Clock, Footprints } from "lucide-react";
import type { Shop } from "../../data/types";
import { useTravelRoutes } from "../maps/travel";
import {
  fromTehranInput,
  nextOpening,
  scheduleAt,
  tehranInput,
} from "./schedule";
import { Badge, Button } from "../../components/primitives";
export function VisitTiming({
  shop,
  departure,
  onChange,
}: {
  shop: Shop;
  departure: string;
  onChange: (v: string) => void;
}) {
  const routes = useTravelRoutes(shop, true);
  const date = fromTehranInput(departure);
  return (
    <section className="visit-timing">
      <div className="field-heading">
        <div>
          <span className="eyebrow">قدم سوم · زمان مراجعه</span>
          <h3>وقتی برسید، فروشگاه باز است؟</h3>
        </div>
        <Clock size={23} />
      </div>
      <div className="departure-field">
        <label className="field">
          زمان حرکت · تهران
          <input
            aria-label="زمان حرکت"
            type="datetime-local"
            value={departure}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <Button onClick={() => onChange(tehranInput())}>همین حالا</Button>
      </div>
      <div className="arrival-options">
        {(["driving", "walking"] as const).map((mode) => {
          const Icon = mode === "driving" ? Car : Footprints;
          const route = routes[mode];
          const arrival =
            date && route
              ? new Date(date.getTime() + route.durationSeconds * 1000)
              : null;
          const status = arrival ? scheduleAt(shop, arrival) : "unknown";
          const opens =
            arrival && status === "closed" ? nextOpening(shop, arrival) : null;
          return (
            <div key={mode}>
              <Icon size={20} />
              <span>
                {mode === "driving" ? "رسیدن با خودرو" : "رسیدن پیاده"}
                <strong>
                  {arrival
                    ? new Intl.DateTimeFormat("fa-IR", {
                        timeZone: "Asia/Tehran",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(arrival)
                    : routes.busy
                      ? "در حال محاسبه…"
                      : "نیازمند مسیر"}
                </strong>
                {opens && <small>شروع بعدی: {opens}</small>}
              </span>
              <Badge
                tone={
                  status === "open"
                    ? "success"
                    : status === "closed"
                      ? "warning"
                      : "neutral"
                }
              >
                {status === "open"
                  ? "طبق برنامه باز"
                  : status === "closed"
                    ? "طبق برنامه بسته"
                    : "ساعت رسیدن نامشخص"}
              </Badge>
            </div>
          );
        })}
      </div>
    </section>
  );
}
