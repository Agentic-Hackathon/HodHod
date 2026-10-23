import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Car,
  Footprints,
  MapPin,
  Navigation,
  RefreshCw,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import { useStore } from "../../state/store";
import { uiEvents } from "../../state/events";
import { api } from "../../data/api";
import type { Offer, Shop } from "../../data/types";
import {
  Badge,
  Button,
  EmptyState,
  ProductImage,
} from "../../components/primitives";
import { fa, haversine, money, date } from "../../i18n/format";
import { fromTehranInput, tehranInput } from "../visit/schedule";
import { fetchTravel, type TravelRoute } from "../maps/travel";
import { travelTime } from "../maps/RoutePreview";
import {
  createMission,
  latestReports,
  rankMission,
  type ArrivalState,
} from "./decision";
import type { ExplorationResponse, MissionResponse } from "./types";
import { PurchaseOutcome, outcomeLabels } from "./PurchaseOutcome";
import { parseAmount } from "../../components/BudgetPicker";
import type { UIBlock } from "../../generative-ui/schema";
const ContextMap = lazy(() =>
  import("../maps/ContextMap").then((m) => ({ default: m.ContextMap })),
);
const clock = (date: Date) =>
  new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
const labels: Record<ArrivalState, string> = {
  ready: "فرصت مناسب برای مراجعه",
  tight: "فرصت خرید کوتاه است",
  closed: "هنگام رسیدن بسته است",
  unknown: "ساعت کاری نامشخص",
  route_unknown: "زمان رسیدن بررسی نشده",
};

export function ShoppingMissionWorkspace({
  onLocation,
  onVisit,
  intent,
}: {
  onLocation: () => void;
  onVisit: (offer: Offer) => void;
  intent?: UIBlock["props"]["mission"];
}) {
  const { session: s, set, remember } = useStore();
  const [fallback] = useState(() => createMission());
  const mission = s.mission || fallback;
  const [draft, setDraft] = useState(mission);
  const [editing, setEditing] = useState(false);
  const appliedIntent = useRef("");
  const intentKey = JSON.stringify(intent);
  useEffect(() => {
    if (intent && appliedIntent.current !== intentKey) {
      appliedIntent.current = intentKey;
      const configured = { ...createMission(), ...intent };
      set({ mission: configured });
      setDraft(configured);
    }
  }, [intentKey]);
  const [data, setData] = useState<MissionResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [routes, setRoutes] = useState<Record<string, TravelRoute | null>>({});
  const [routeLimit, setRouteLimit] = useState(6);
  const [exploration, setExploration] = useState<ExplorationResponse | null>(
    null,
  );
  const [exploring, setExploring] = useState(false);
  const [external, setExternal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const explorationVersion = useRef(0);
  const geography = useRef<HTMLElement>(null);
  const reports = [...latestReports(s.visitReports || [], mission.id).values()];
  const excludeOffers = reports
    .filter((r) => ["sold_out", "purchased"].includes(r.outcome))
    .map((r) => r.offerId)
    .sort()
    .join(",");
  const excludeShops = reports
    .filter((r) => r.outcome === "closed")
    .map((r) => r.shopId)
    .sort()
    .join(",");
  const departure = fromTehranInput(mission.departure);
  const requestKey = JSON.stringify([
    mission.id,
    mission.query,
    mission.required,
    mission.category,
    mission.departure,
    mission.max,
    mission.radius,
    s.location?.lat,
    s.location?.lon,
    excludeOffers,
    excludeShops,
  ]);
  useEffect(() => {
    setDraft(mission);
  }, [mission.id]);
  useEffect(() => {
    explorationVersion.current++;
    setExploration(null);
    setExploring(false);
    setExternal(false);
  }, [s.location?.lat, s.location?.lon, mission.query, mission.required]);
  useEffect(() => {
    setRouteLimit(6);
    setData(
      s.missionSnapshot?.key === requestKey ? s.missionSnapshot.response : null,
    );
    setRoutes({});
    setError("");
    setBusy(false);
    if (
      !mission.query.trim() ||
      (/شارژر/.test(mission.query) && !mission.category) ||
      !s.location ||
      !departure
    )
      return;
    const controller = new AbortController();
    setBusy(true);
    const params = new URLSearchParams({
      q: mission.query,
      required: mission.required,
      category: mission.category || "",
      departure: departure.toISOString(),
      radius: String(mission.radius),
      lat: String(s.location.lat),
      lon: String(s.location.lon),
      max: mission.max,
      excludeOffers,
      excludeShops,
    });
    api<MissionResponse>("mission?" + params, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        remember(
          result.entries.map((e) => e.product),
          result.entries.map((e) => e.shop),
          result.entries.map((e) => e.offer),
        );
        set({ missionSnapshot: { key: requestKey, response: result } });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [requestKey, retry]);
  const origin = s.location;
  const routeKey = JSON.stringify([
    data?.entries.map((e) => [e.shop.id, e.departureStatus]),
    origin?.lat,
    origin?.lon,
    mission.mode,
    routeLimit,
  ]);
  useEffect(() => {
    if (!data || !origin) return;
    let active = true;
    const byStatus = (status: string) =>
      data.entries.filter((e) => e.departureStatus === status);
    const initial = [
      ...byStatus("open").slice(0, 4),
      ...byStatus("unknown").slice(0, 1),
      ...byStatus("closed").slice(0, 1),
    ];
    const selected = [
      ...initial,
      ...data.entries.filter(
        (e) => !initial.some((i) => i.shop.id === e.shop.id),
      ),
    ].slice(0, routeLimit);
    setRoutes({});
    selected.forEach((entry) => {
      fetchTravel(entry.shop.id, origin.lat, origin.lon, mission.mode).then(
        (route) => {
          if (active)
            setRoutes((current) => ({ ...current, [entry.shop.id]: route }));
        },
      );
    });
    return () => {
      active = false;
    };
  }, [routeKey]);
  const ranked = rankMission(
    data?.entries || [],
    routes,
    mission,
    s.visitReports || [],
  );
  const visible = mission.onlyReady
    ? ranked.filter((e) => e.status === "ready")
    : ranked;
  const primary = visible.find(
    (e) => e.status !== "closed" && e.status !== "tight",
  );
  const secondary = visible.find(
    (e) => e.offer.id !== primary?.offer.id && e.status !== "closed",
  );
  const completed = reports.find((r) => r.outcome === "purchased");
  const patch = (values: Partial<typeof mission>) => {
    set({ mission: { ...mission, ...values } });
    uiEvents.emit({ type: "mission.change", payload: values });
  };
  const explore = async (kind: string) => {
    if (!origin) {
      onLocation();
      return;
    }
    const version = ++explorationVersion.current;
    setExploring(true);
    try {
      const result = await api<ExplorationResponse>(
        "explore?" +
          new URLSearchParams({
            lat: String(origin.lat),
            lon: String(origin.lon),
            radius: "2000",
            kind,
          }),
      );
      if (version === explorationVersion.current) {
        setExploration(result);
        setExternal(true);
      }
    } catch {
      if (version === explorationVersion.current)
        setExploration({
          status: "unavailable",
          places: [],
          source: "OpenStreetMap",
          fetchedAt: Date.now() / 1000,
        });
    } finally {
      if (version === explorationVersion.current) setExploring(false);
    }
  };
  const externalShops: Shop[] = (exploration?.places || []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    address: null,
    area: null,
    categories: [],
    hours: {},
    payments: [],
    fastDelivery: null,
    website: p.sourceUrl,
    instagram: null,
    syntheticName: false,
    syntheticPhone: false,
  }));
  const shownShops = external ? externalShops : visible.map((e) => e.shop);
  return (
    <section className="shopping-mission">
      <div className="mission-heading">
        <div>
          <span className="eyebrow">از نیاز تا خرید انجام‌شده</span>
          <h2>الان کجا بروم؟</h2>
        </div>
        <Badge tone="accent">خرید فوری</Badge>
      </div>
      <details
        className="mission-editor"
        open={
          editing ||
          !mission.query ||
          !origin ||
          (/شارژر/.test(mission.query) && !mission.category)
        }
        onToggle={(e) => setEditing(e.currentTarget.open)}
      >
        <summary>
          <span>
            {mission.query || "نیاز خرید را مشخص کنید"}
            {mission.query
              ? ` · ${mission.departure.slice(11)} · ${origin?.label || "مبدأ نامشخص"}`
              : ""}
          </span>
          <b>تغییر نیاز و زمان</b>
        </summary>
        <form
          className="mission-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!fromTehranInput(draft.departure)) {
              setError("زمان حرکت معتبر نیست.");
              return;
            }
            const query = draft.query.trim();
            set({
              mission: {
                ...draft,
                query,
                id:
                  query !== mission.query || draft.category !== mission.category
                    ? crypto.randomUUID()
                    : mission.id,
              },
            });
            uiEvents.emit({
              type: "mission.start",
              payload: {
                query: draft.query.trim(),
                departure: draft.departure,
              },
            });
            setEditing(false);
            if (!origin) onLocation();
          }}
        >
          <label className="field">
            چه چیزی لازم داری؟
            <input
              required
              maxLength={100}
              aria-label="نیاز خرید فوری"
              placeholder="مثلاً شارژر سامسونگ"
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
            />
          </label>
          {/شارژر/.test(draft.query) && (
            <label className="field mission-clarification">
              شارژر برای چه دستگاهی؟
              <select
                required
                aria-label="کاربرد شارژر"
                value={draft.category || ""}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                <option value="">کاربرد را انتخاب کنید</option>
                {[
                  "شارژر گوشی",
                  "شارژر لپ تاپ",
                  "شارژر دوربین",
                  "شارژر ساعت هوشمند",
                  "جاباتری و شارژر باتری",
                  "شارژر فندکی خودرو",
                  "شارژر وایرلس و پایه شارژ",
                  "سایر شارژر",
                ].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mission-time-row">
            <label className="field">
              زمان حرکت · تهران
              <input
                required
                type="datetime-local"
                aria-label="زمان حرکت خرید فوری"
                value={draft.departure}
                onChange={(e) =>
                  setDraft({ ...draft, departure: e.target.value })
                }
              />
            </label>
            <Button
              type="button"
              onClick={() => setDraft({ ...draft, departure: tehranInput() })}
            >
              همین الان
            </Button>
          </div>
          <details className="mission-preferences">
            <summary>ویژگی ضروری و شرایط خرید</summary>
            <label className="field">
              عبارت ضروری در عنوان کالا
              <input
                aria-label="ویژگی ضروری کالا"
                placeholder="مثلاً Type C؛ سازگاری را در مشخصات بررسی کنید"
                value={draft.required}
                maxLength={80}
                onChange={(e) =>
                  setDraft({ ...draft, required: e.target.value })
                }
              />
            </label>
            <label className="field">
              حداکثر بودجه · تومان
              <input
                type="text"
                inputMode="numeric"
                value={draft.max}
                onChange={(e) =>
                  setDraft({ ...draft, max: parseAmount(e.target.value) })
                }
              />
            </label>
            <label className="field">
              فرصت لازم برای خرید
              <select
                value={draft.shoppingMinutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    shoppingMinutes: Number(e.target.value),
                  })
                }
              >
                {[5, 10, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {fa(n)} دقیقه
                  </option>
                ))}
              </select>
            </label>
          </details>
          <div className="mission-form-actions">
            <Button type="button" onClick={onLocation}>
              <MapPin size={16} />
              {origin?.label || "انتخاب موقعیت من"}
            </Button>
            <Button variant="primary" type="submit">
              پیشنهاد مراجعه را پیدا کن
            </Button>
          </div>
        </form>
      </details>
      {error && (
        <div role="alert" className="mission-error">
          {error}
          <Button onClick={() => setRetry((n) => n + 1)}>تلاش دوباره</Button>
        </div>
      )}
      {busy && (
        <p role="status">بررسی پیشنهادهای ثبت‌شده و ساعت کاری فروشگاه‌ها…</p>
      )}
      {data && (
        <>
          <div className="mission-controls">
            <div className="segmented" role="group" aria-label="روش رفتن">
              {(["driving", "walking"] as const).map((mode) => {
                const Icon = mode === "driving" ? Car : Footprints;
                return (
                  <button
                    key={mode}
                    aria-pressed={mission.mode === mode}
                    className={mission.mode === mode ? "active" : ""}
                    onClick={() => {
                      patch({ mode });
                      setDraft((d) => ({ ...d, mode }));
                    }}
                  >
                    <Icon size={16} />
                    {mode === "driving" ? "با خودرو" : "پیاده"}
                  </button>
                );
              })}
            </div>
            <button
              className="mission-chip"
              aria-pressed={mission.onlyReady}
              onClick={() => {
                patch({ onlyReady: !mission.onlyReady });
                setDraft((d) => ({ ...d, onlyReady: !mission.onlyReady }));
              }}
            >
              فقط گزینه‌های قابل مراجعه
            </button>
            <button
              className="mission-chip"
              onClick={() => {
                const radius = Math.min(30, mission.radius * 2);
                patch({ radius });
                setDraft((d) => ({ ...d, radius }));
              }}
              disabled={mission.radius >= 30}
            >
              گسترش محدوده · {fa(mission.radius)} کیلومتر
            </button>
          </div>
          <p className="mission-context">
            در شعاع {fa(mission.radius)} کیلومتری هنگام حرکت:{" "}
            {fa(data.nearby.open)} فروشگاه با ساعت باز، {fa(data.nearby.closed)}{" "}
            بسته و {fa(data.nearby.unknown)} با ساعت نامشخص.{" "}
            {fa(data.totalShops)} فروشگاه دارای پیشنهاد مطابق جست‌وجو تا{" "}
            {fa(data.searchedRadius)} کیلومتر بررسی شد.
          </p>
          <p className="mission-progress" role="status">
            <Clock3 size={15} />
            {fa(Object.keys(routes).length)} از{" "}
            {fa(Math.min(routeLimit, data.entries.length))} مسیر بررسی شد ·
            تصمیم براساس زمان رسیدن و {fa(mission.shoppingMinutes)} دقیقه فرصت
            خرید
          </p>
          {completed ? (
            <div className="mission-complete">
              <CheckCircle2 />
              <h3>خریدت انجام شد</h3>
              <p>نتیجه در همین گفت‌وگو ذخیره شد.</p>
              <Button
                onClick={() =>
                  set({
                    visitReports: (s.visitReports || []).filter(
                      (r) => r.id !== completed.id,
                    ),
                  })
                }
              >
                اصلاح گزارش خرید
              </Button>
            </div>
          ) : primary ? (
            <>
              <article
                className={`mission-recommendation ${primary.status}`}
                data-offer-id={primary.offer.id}
              >
                <div className="section-heading">
                  <Badge tone="accent">پیشنهاد فعلی</Badge>
                  <span className="mission-status">
                    {labels[primary.status]}
                  </span>
                </div>
                <div className="mission-product">
                  <ProductImage
                    src={primary.product.images[0]}
                    title={primary.product.title}
                  />
                  <div>
                    <h3 dir="auto">{primary.product.title}</h3>
                    <p>{primary.shop.name}</p>
                    <strong>
                      {money(primary.offer.price)}
                      {primary.offer.price !== null ? " تومان" : ""}
                    </strong>
                    <small className="mission-stock">
                      {primary.report?.outcome === "confirmed"
                        ? "موجودی طبق گزارش شما"
                        : "موجودی هنوز تأیید نشده"}{" "}
                      · آخرین تغییر قیمت: {date(primary.offer.changedAt)}
                    </small>
                  </div>
                </div>
                <div className="mission-arrival">
                  <span>
                    رسیدن
                    <strong>
                      {primary.arrival ? clock(primary.arrival) : "نامشخص"}
                    </strong>
                  </span>
                  <span>
                    زمان مسیر
                    <strong>
                      {primary.route
                        ? travelTime(primary.route.durationSeconds)
                        : "دریافت نشده"}
                    </strong>
                  </span>
                  <span>
                    فرصت تا بسته‌شدن
                    <strong>
                      {primary.remaining !== null
                        ? `حدود ${fa(primary.remaining)} دقیقه`
                        : "نامشخص"}
                    </strong>
                  </span>
                </div>
                <p className="mission-reason">
                  {primary.status === "ready"
                    ? `طبق ساعت کاری ثبت‌شده، هنگام رسیدن و در ${fa(mission.shoppingMinutes)} دقیقهٔ بعد از آن باز است.`
                    : "پیش از حرکت، ساعت مراجعه و موجودی این انتخاب را بررسی کنید."}
                  {primary.distance > mission.radius
                    ? ` این گزینه بیرون شعاع اولیه، در فاصلهٔ مستقیم ${fa(primary.distance)} کیلومتری است.`
                    : ""}
                </p>
                <details>
                  <summary>مشخصات و دلیل تطابق</summary>
                  <p>
                    عنوان کالا با «{mission.query}
                    {mission.required ? " " + mission.required : ""}» جست‌وجو
                    شده؛ تطابق عنوان تأیید سازگاری فنی نیست.
                  </p>
                  <dl className="mission-specs">
                    {primary.product.specs.slice(0, 8).map((spec, i) => (
                      <div key={i}>
                        <dt>{spec.key}</dt>
                        <dd>{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
                <div className="mission-primary-actions">
                  <Button
                    variant="primary"
                    onClick={() => onVisit(primary.offer)}
                  >
                    <Navigation size={16} />
                    برنامهٔ رفتن به این فروشگاه
                  </Button>
                  <Button
                    onClick={() => {
                      set({
                        selectedShop: primary.shop.id,
                        selectedOffer: primary.offer.id,
                      });
                      setExternal(false);
                      geography.current?.scrollIntoView({
                        block: "start",
                        behavior: "smooth",
                      });
                    }}
                  >
                    نمایش روی نقشه
                  </Button>
                </div>
                <PurchaseOutcome offer={primary.offer} />
              </article>
              {secondary && (
                <article className="mission-backup">
                  <div>
                    <span className="eyebrow">برنامهٔ جایگزین</span>
                    <h3 dir="auto">{secondary.product.title}</h3>
                    <p>
                      {secondary.shop.name} · {labels[secondary.status]} ·{" "}
                      {money(secondary.offer.price)}
                      {secondary.offer.price !== null ? " تومان" : ""}
                    </p>
                  </div>
                  <Button onClick={() => onVisit(secondary.offer)}>
                    بررسی جایگزین
                  </Button>
                </article>
              )}
            </>
          ) : (
            <EmptyState
              title={
                mission.onlyReady
                  ? "فعلاً گزینه‌ای با مسیر و ساعت مناسب تأیید نشده"
                  : "گزینهٔ مناسبی برای مراجعه پیدا نشد"
              }
              description="می‌توانید مسیرهای بیشتری بررسی کنید، شرایط را تغییر دهید یا نقاط عمومی مرتبط را ببینید."
            />
          )}
          <section className="mission-geography" ref={geography}>
            <div className="section-heading">
              <h3>
                {external
                  ? "نقاط عمومی برای بررسی حضوری"
                  : "موقعیت شما و گزینه‌های خرید"}
              </h3>
              {external && (
                <Button onClick={() => setExternal(false)}>
                  بازگشت به فروشگاه‌های دارای آفر
                </Button>
              )}
            </div>
            <Suspense fallback={<p>آماده‌سازی نقشه…</p>}>
              <ContextMap
                origin={origin}
                radius={mission.radius}
                shops={shownShops}
                selectedShop={external ? selectedPlace : s.selectedShop}
                onSelect={(shop) => {
                  if (external) setSelectedPlace(shop.id);
                  else {
                    const entry = visible.find((e) => e.shop.id === shop.id);
                    set({
                      selectedShop: shop.id,
                      selectedOffer: entry?.offer.id || null,
                    });
                  }
                }}
              />
            </Suspense>
          </section>
          <details className="mission-all-options">
            <summary>
              همهٔ گزینه‌های بررسی‌شده · {fa(visible.length)} فروشگاه
            </summary>
            <div className="mission-option-list">
              {visible.map((entry) => (
                <article
                  key={entry.offer.id}
                  className={s.selectedShop === entry.shop.id ? "selected" : ""}
                >
                  <div>
                    <h4>{entry.shop.name}</h4>
                    <p dir="auto">{entry.product.title}</p>
                    <small>
                      {labels[entry.status]} · {fa(entry.distance)} کیلومتر
                      مستقیم
                      {entry.arrival ? ` · رسیدن ${clock(entry.arrival)}` : ""}
                    </small>
                  </div>
                  <strong>{money(entry.offer.price)}</strong>
                  <Button onClick={() => onVisit(entry.offer)}>
                    جزئیات مراجعه
                  </Button>
                </article>
              ))}
            </div>
          </details>
          {routeLimit < data.entries.length && (
            <Button onClick={() => setRouteLimit((n) => n + 6)}>
              <RefreshCw size={15} />
              بررسی مسیر گزینه‌های بیشتر
            </Button>
          )}
        </>
      )}
      {origin && mission.query && (
        <section className="mission-exploration">
          <h3>راه دیگری در نزدیکی شما</h3>
          <p>
            نقاط عمومی مرتبط را جداگانه جست‌وجو کنید. داشتن این کالا، بازبودن
            فعلی و عضویت آن‌ها در ترب از این اطلاعات مشخص نمی‌شود.
          </p>
          <div className="outcome-actions">
            {[
              ["electronics", "لوازم الکترونیکی اطراف"],
              ["clothes", "پوشاک اطراف"],
              ["general", "مراکز خرید اطراف"],
            ].map(([kind, label]) => (
              <Button
                key={kind}
                disabled={exploring}
                onClick={() => explore(kind)}
              >
                {label}
              </Button>
            ))}
          </div>
          {exploring && <p role="status">جست‌وجوی نقاط عمومی OpenStreetMap…</p>}
          {exploration?.status === "unavailable" && (
            <p role="status">
              سرویس نقاط عمومی در دسترس نیست؛ پیشنهاد ثبت‌شده‌ای اضافه نشده است.
            </p>
          )}
          {exploration?.status === "ready" && !exploration.places.length && (
            <p>نقطهٔ مرتبطی در شعاع ۲ کیلومتر ثبت نشده است.</p>
          )}
          <div className="exploration-places">
            {exploration?.places.map((place) => (
              <article
                key={place.id}
                className={selectedPlace === place.id ? "selected" : ""}
              >
                <Badge>گزینهٔ اکتشافی · موجودی نامشخص</Badge>
                <h4>{place.name}</h4>
                <p>{fa(haversine(origin, place))} کیلومتر مستقیم</p>
                {place.openingHours && (
                  <p>
                    ساعت ثبت‌شده در نقشه: <b dir="ltr">{place.openingHours}</b>
                  </p>
                )}
                <small>
                  OpenStreetMap · دریافت{" "}
                  {clock(new Date(exploration.fetchedAt * 1000))}
                </small>
                <div>
                  <Button
                    onClick={() => {
                      setExternal(true);
                      setSelectedPlace(place.id);
                    }}
                  >
                    روی نقشه
                  </Button>
                  <a href={place.sourceUrl} target="_blank" rel="noreferrer">
                    مشاهدهٔ منبع
                  </a>
                  <a
                    href={`https://www.openstreetmap.org/directions?to=${place.lat},${place.lon}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    مسیریابی
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {reports.length > 0 && (
        <details className="mission-reports" open>
          <summary>پیگیری‌های همین خرید · {fa(reports.length)}</summary>
          {reports.map((report) => (
            <div key={report.id}>
              <span>
                {s.entities.shops[report.shopId]?.name || "فروشگاه"} ·{" "}
                {outcomeLabels[report.outcome]}
                <small>گزارش شما · {clock(new Date(report.at))}</small>
              </span>
              <Button
                onClick={() =>
                  set({
                    visitReports: (s.visitReports || []).filter(
                      (r) =>
                        r.offerId !== report.offerId ||
                        r.missionId !== mission.id,
                    ),
                  })
                }
              >
                لغو گزارش
              </Button>
            </div>
          ))}
          <Button
            onClick={() => {
              const now = tehranInput();
              patch({ departure: now });
              setDraft((d) => ({ ...d, departure: now }));
              onLocation();
              uiEvents.emit({
                type: "mission.replan",
                payload: { departure: now },
              });
            }}
          >
            برنامه‌ریزی از موقعیت و زمان جدید
          </Button>
        </details>
      )}
    </section>
  );
}
