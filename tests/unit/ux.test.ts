import { describe, it, expect } from "vitest";
import {
  candidates,
  groupOffers,
} from "../../src/features/comparison/decision";
import { parseAmount } from "../../src/components/BudgetPicker";
import {
  fromTehranInput,
  scheduleAt,
  tehranInput,
  nextOpening,
} from "../../src/features/visit/schedule";
import type { Offer, Shop } from "../../src/data/types";
const shop = {
  id: "s",
  name: "shop",
  lat: 35,
  lon: 51,
  hours: {
    fri: {
      status: "declared",
      shifts: [{ start_time: "09:00:00", end_time: "17:00:00" }],
    },
    sat: {
      status: "declared",
      shifts: [{ start_time: "09:00:00", end_time: "17:00:00" }],
    },
  },
  payments: [],
} as unknown as Shop;
const offer = (id: string, productId: string, price: number, shopId = "s") =>
  ({ id, productId, shopId, price }) as Offer;
describe("clear price and comparison semantics", () => {
  it("normalizes Persian and Arabic formatted amounts", () => {
    expect(parseAmount("۱٬۲۵۰٬۰۰۰ تومان")).toBe("1250000");
    expect(parseAmount("١٢٠٠")).toBe("1200");
  });
  it("groups only same product+shop; preserves distinct offers and avoids duplicate IDs", () => {
    const groups = groupOffers([
      offer("a", "p", 30),
      offer("b", "p", 20),
      offer("c", "q", 10),
      offer("a", "p", 30),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((o) => o.id)).toEqual(["b", "a"]);
  });
  it("computes the actual non-dominated frontier rather than highlighting first result", () => {
    const far = { ...shop, id: "far", lat: 35.01 };
    const list = candidates(
      [
        offer("dominated", "p", 300, "far"),
        offer("near", "p", 200),
        offer("cheap", "q", 100, "far"),
      ],
      [shop, far],
      {},
      { lat: 35, lon: 51, label: "origin" },
    );
    expect(list.find((c) => c.offer.id === "dominated")?.pareto).toBe(false);
    expect(list.filter((c) => c.pareto).map((c) => c.offer.id)).toEqual([
      "near",
      "cheap",
    ]);
  });
});
describe("Tehran visit schedule", () => {
  it("round trips Tehran departure time independent of host timezone", () => {
    expect(tehranInput(fromTehranInput("2026-10-23T12:15")!)).toBe(
      "2026-10-23T12:15",
    );
  });
  it("checks opening and closing at arrival with end-exclusive boundary", () => {
    expect(scheduleAt(shop, fromTehranInput("2026-10-23T09:00")!)).toBe("open");
    expect(scheduleAt(shop, fromTehranInput("2026-10-23T17:00")!)).toBe(
      "closed",
    );
    expect(nextOpening(shop, fromTehranInput("2026-10-23T18:00")!)).toContain(
      "09:00",
    );
  });
  it("does not treat placeholder 00:00 shifts as open or fabricate missing hours", () => {
    expect(scheduleAt({ ...shop, hours: {} }, new Date())).toBe("unknown");
    expect(
      scheduleAt(
        {
          ...shop,
          hours: {
            fri: {
              status: "declared",
              shifts: [{ start_time: "00:00:00", end_time: "00:00:00" }],
            },
          },
        },
        fromTehranInput("2026-10-23T12:00")!,
      ),
    ).toBe("unknown");
  });
  it("handles overnight shifts from previous day", () => {
    const hours = {
      thu: {
        status: "declared",
        shifts: [{ start_time: "22:00:00", end_time: "02:00:00" }],
      },
      fri: { status: "closed", shifts: [] },
    };
    expect(
      scheduleAt({ ...shop, hours }, fromTehranInput("2026-10-23T01:00")!),
    ).toBe("open");
  });
});
