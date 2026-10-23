import type { Shop } from "../../data/types";
import { scheduleAt, fromTehranInput, tehranInput } from "../visit/schedule";
import type { TravelRoute } from "../maps/travel";
import type { MissionEntry, ShoppingMission, VisitReport } from "./types";

export function createMission(query = ""): ShoppingMission {
  return {
    id: crypto.randomUUID(),
    query,
    required: "",
    category: "",
    departure: tehranInput(),
    mode: "driving",
    radius: 2,
    max: "",
    shoppingMinutes: 10,
    onlyReady: false,
  };
}
export function urgentNeed(text: string) {
  if (
    !/فوری|امشب|الان|همین امروز|باز باش|بسته بود|نیمه.?شب|ساعت.*شب/.test(text)
  )
    return null;
  return (
    text.match(/شارژر|کابل|پاوربانک|هدفون|باتری|لپ.?تاپ|گوشی|کفش|کیف/)?.[0] ||
    null
  );
}
export function missionFromText(text: string, now = new Date()) {
  const query = urgentNeed(text);
  if (!query) return null;
  const mission = createMission(query);
  mission.departure = tehranInput(now);
  const normalized = text
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
  const time = normalized.match(/ساعت\s*(\d{1,2})(?::(\d{2}))?/);
  if (time) {
    let hour = Number(time[1]);
    const minute = Number(time[2] || 0);
    if (/شب|عصر/.test(normalized) && hour < 12) hour += 12;
    if (/نیمه.?شب/.test(normalized) && hour === 12) hour = 0;
    if (hour < 24 && minute < 60)
      mission.departure =
        mission.departure.slice(0, 11) +
        String(hour).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0");
  }
  if (/پیاده/.test(text)) mission.mode = "walking";
  const brand = text.match(/سامسونگ|شیائومی|اپل|آیفون|انکر|سونی/)?.[0];
  if (brand) mission.query += " " + brand;
  if (query === "شارژر" && /موبایل|گوشی|سامسونگ|شیائومی|اپل|آیفون/.test(text))
    mission.category = "شارژر گوشی";
  return mission;
}
export type ArrivalState =
  "ready" | "tight" | "closed" | "unknown" | "route_unknown";
export function arrivalAssessment(
  shop: Shop,
  departure: Date,
  route: TravelRoute | null | undefined,
  shoppingMinutes: number,
) {
  if (
    !route ||
    !Number.isFinite(route.durationSeconds) ||
    route.durationSeconds < 0
  )
    return {
      status: "route_unknown" as ArrivalState,
      arrival: null,
      remaining: null,
    };
  const arrival = new Date(departure.getTime() + route.durationSeconds * 1000);
  const state = scheduleAt(shop, arrival);
  if (state !== "open")
    return { status: state as ArrivalState, arrival, remaining: null };
  let remaining = null;
  for (let minute = 1; minute <= 1440; minute++) {
    const status = scheduleAt(
      shop,
      new Date(arrival.getTime() + minute * 60000),
    );
    if (status !== "open") {
      remaining = status === "closed" ? minute : null;
      break;
    }
  }
  const end = scheduleAt(
    shop,
    new Date(arrival.getTime() + shoppingMinutes * 60000),
  );
  return {
    status: (remaining !== null && remaining <= shoppingMinutes
      ? "tight"
      : end === "unknown"
        ? "unknown"
        : "ready") as ArrivalState,
    arrival,
    remaining,
  };
}
export function latestReports(reports: VisitReport[], missionId: string) {
  const latest = new Map<string, VisitReport>();
  for (const report of reports)
    if (report.missionId === missionId) latest.set(report.offerId, report);
  return latest;
}
export function rankMission(
  entries: MissionEntry[],
  routes: Record<string, TravelRoute | null>,
  mission: ShoppingMission,
  reports: VisitReport[],
) {
  const departure = fromTehranInput(mission.departure);
  if (!departure) return [];
  const latest = latestReports(reports, mission.id);
  const closedShops = new Set(
    [...latest.values()]
      .filter((r) => r.outcome === "closed")
      .map((r) => r.shopId),
  );
  const order: Record<ArrivalState, number> = {
    ready: 0,
    tight: 2,
    unknown: 3,
    route_unknown: 4,
    closed: 5,
  };
  return entries
    .filter(
      (e) =>
        !closedShops.has(e.shop.id) &&
        !["sold_out", "purchased"].includes(
          latest.get(e.offer.id)?.outcome || "",
        ),
    )
    .map((entry) => {
      const assessment = arrivalAssessment(
        entry.shop,
        departure,
        routes[entry.shop.id],
        mission.shoppingMinutes,
      );
      const report = latest.get(entry.offer.id);
      return { ...entry, ...assessment, route: routes[entry.shop.id], report };
    })
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        Number(b.report?.outcome === "confirmed") -
          Number(a.report?.outcome === "confirmed") ||
        Number(a.report?.outcome === "no_answer") -
          Number(b.report?.outcome === "no_answer") ||
        (a.route?.durationSeconds ?? Infinity) -
          (b.route?.durationSeconds ?? Infinity) ||
        a.distance - b.distance ||
        (a.offer.price ?? Infinity) - (b.offer.price ?? Infinity),
    );
}
