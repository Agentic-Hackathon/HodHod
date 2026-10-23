import { describe, it, expect } from "vitest";
import { KnownBlockSchema } from "../../src/generative-ui/schema";
import {
  arrivalAssessment,
  createMission,
  missionFromText,
  rankMission,
} from "../../src/features/mission/decision";
import { fromTehranInput } from "../../src/features/visit/schedule";
import type { Shop } from "../../src/data/types";
import type { TravelRoute } from "../../src/features/maps/travel";
import type {
  MissionEntry,
  VisitReport,
} from "../../src/features/mission/types";
const shop = (id = "s", end = "23:45:00") =>
  ({
    id,
    name: id,
    hours: {
      fri: {
        status: "declared",
        shifts: [{ start_time: "10:00:00", end_time: end }],
      },
    },
  }) as unknown as Shop;
const route = (minutes: number) =>
  ({ durationSeconds: minutes * 60 }) as TravelRoute;
const date = fromTehranInput("2026-10-23T23:30")!;
const entry = (id: string, end: string, distance = 1) =>
  ({
    shop: shop(id, end),
    offer: { id, shopId: id, productId: "p", price: 100 },
    product: { id: "p", title: "charger" },
    distance,
    departureStatus: "open",
  }) as MissionEntry;
describe("a purchase that can actually be completed", () => {
  it("accepts a bounded agent intent and rejects fabricated evidence in its props", () => {
    const block = {
      id: "urgent",
      type: "shopping_mission",
      props: {
        mission: {
          query: "شارژر",
          category: "شارژر گوشی",
          mode: "walking",
          radius: 2,
          shoppingMinutes: 10,
        },
      },
    };
    expect(KnownBlockSchema.safeParse(block).success).toBe(true);
    expect(
      KnownBlockSchema.safeParse({
        ...block,
        props: { mission: { ...block.props.mission, inventoryVerified: true } },
      }).success,
    ).toBe(false);
    expect(
      KnownBlockSchema.safeParse({
        ...block,
        props: { mission: { ...block.props.mission, radius: 500 } },
      }).success,
    ).toBe(false);
  });
  it("recognizes a Persian late-night request without losing the stated time and travel mode", () => {
    const m = missionFromText(
      "ساعت ۱۱:۳۰ شب هست و فوری شارژر سامسونگ میخوام؛ پیاده میرم",
      date,
    )!;
    expect(m.query).toBe("شارژر سامسونگ");
    expect(m.departure).toBe("2026-10-23T23:30");
    expect(m.mode).toBe("walking");
    expect(missionFromText("گوشی زیر سی میلیون")).toBeNull();
  });
  it("does not interpret invalid times or fabricate travel time", () => {
    expect(
      missionFromText("الان ساعت ۲۵:۷۰ شارژر میخوام", date)?.departure,
    ).toBe("2026-10-23T23:30");
    expect(arrivalAssessment(shop(), date, null, 10).status).toBe(
      "route_unknown",
    );
  });
  it("rejects a currently open shop when arrival is after closing", () => {
    expect(arrivalAssessment(shop(), date, route(20), 10).status).toBe(
      "closed",
    );
  });
  it("keeps a sufficient shopping buffer rather than accepting an almost-closed shop", () => {
    expect(arrivalAssessment(shop(), date, route(10), 10).status).toBe("tight");
    expect(arrivalAssessment(shop(), date, route(2), 10).status).toBe("ready");
  });
  it("handles overnight shifts across Tehran midnight and preserves unknown schedules", () => {
    const overnight = shop("night", "02:00:00");
    expect(arrivalAssessment(overnight, date, route(50), 10).status).toBe(
      "ready",
    );
    expect(
      arrivalAssessment({ ...shop(), hours: {} }, date, route(5), 10).status,
    ).toBe("unknown");
  });
  it("ranks a farther feasible shop above a closer shop that will close", () => {
    const mission = {
      ...createMission("charger"),
      departure: "2026-10-23T23:30",
    };
    const list = rankMission(
      [entry("near", "23:35:00"), entry("far", "02:00:00", 4)],
      { near: route(10), far: route(20) },
      mission,
      [],
    );
    expect(list[0].shop.id).toBe("far");
    expect(list[0].status).toBe("ready");
  });
  it("keeps feedback source-scoped and replans after failure; an explicit later correction wins", () => {
    const mission = {
      ...createMission("charger"),
      departure: "2026-10-23T23:30",
    };
    const report = {
      id: "r",
      missionId: mission.id,
      offerId: "far",
      shopId: "far",
      outcome: "sold_out",
      at: new Date().toISOString(),
    } as VisitReport;
    const entries = [entry("near", "23:35:00"), entry("far", "02:00:00", 4)];
    expect(
      rankMission(entries, {}, mission, [report]).map((e) => e.shop.id),
    ).toEqual(["near"]);
    expect(
      rankMission(entries, {}, mission, [{ ...report, missionId: "other" }]),
    ).toHaveLength(2);
    expect(
      rankMission(entries, {}, mission, [
        report,
        { ...report, outcome: "confirmed" },
      ]),
    ).toHaveLength(2);
  });
});
