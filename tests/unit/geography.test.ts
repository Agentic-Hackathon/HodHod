import { describe, expect, it } from "vitest";
import { radiusPolygon } from "../../src/features/maps/geography";
import { haversine } from "../../src/i18n/format";

describe("geographic search radius", () => {
  for (const lat of [0, 35.6953, 70]) {
    for (const radius of [0.5, 1, 2, 5, 10, 30]) {
      it(`keeps every circle vertex ${radius} km from latitude ${lat}`, () => {
        const origin = { lat, lon: 51.4107 };
        const polygon = radiusPolygon(origin, radius);
        const points = polygon.geometry.coordinates[0];
        expect(points).toHaveLength(97);
        expect(points[0]).toEqual(points.at(-1));
        for (const [lon, lat] of points)
          expect(haversine(origin, { lat, lon })).toBeCloseTo(radius, 7);
      });
    }
  }
});
