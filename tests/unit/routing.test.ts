import { afterEach, describe, it, expect, vi } from "vitest";
import {
  OSRMProvider,
  RoutingUnavailable,
} from "../../src/features/maps/routing";
afterEach(() => vi.unstubAllGlobals());
describe("honest mode-specific routing", () => {
  it("has no ETA without a configured engine", async () => {
    const p = new RoutingUnavailable();
    expect(await p.getStatus()).toBe("unavailable");
    expect(await p.getRoute()).toBe(null);
    expect(await p.getDistanceMatrix()).toBe(null);
  });
  it("never uses a driving profile for walking", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      await new OSRMProvider("http://local", "driving").getRoute(
        [51, 35],
        [51.1, 35.1],
        "walking",
      ),
    ).toBe(null);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("validates route and preserves metric units", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "Ok",
              routes: [
                {
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [51, 35],
                      [51.1, 35.1],
                    ],
                  },
                  distance: 1234,
                  duration: 120,
                },
              ],
            }),
          ),
      ),
    );
    const r = await new OSRMProvider("http://local").getRoute(
      [51, 35],
      [51.1, 35.1],
      "driving",
    );
    expect(r?.distanceMeters).toBe(1234);
    expect(r?.liveTraffic).toBe(false);
  });
  it("degrades on malformed route and network outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "Ok",
              routes: [
                {
                  geometry: { type: "LineString", coordinates: [] },
                  distance: -1,
                  duration: 12,
                },
              ],
            }),
          ),
      ),
    );
    expect(
      await new OSRMProvider("http://local").getRoute(
        [51, 35],
        [52, 36],
        "driving",
      ),
    ).toBe(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(
      await new OSRMProvider("http://local").getRoute(
        [51, 35],
        [52, 36],
        "driving",
      ),
    ).toBe(null);
  });
});
