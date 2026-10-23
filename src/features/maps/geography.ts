import type { Location } from "../../data/types";

/** Great-circle destinations on the same 6371 km sphere used by search. */
export function radiusPolygon(
  origin: Pick<Location, "lat" | "lon">,
  km: number,
) {
  const rad = Math.PI / 180;
  const lat = origin.lat * rad,
    lon = origin.lon * rad;
  const angular = Math.max(0, km) / 6371;
  const coordinates = Array.from({ length: 97 }, (_, i) => {
    const bearing = ((i % 96) * 2 * Math.PI) / 96;
    const y = Math.asin(
      Math.sin(lat) * Math.cos(angular) +
        Math.cos(lat) * Math.sin(angular) * Math.cos(bearing),
    );
    const x =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
        Math.cos(angular) - Math.sin(lat) * Math.sin(y),
      );
    return [((x / rad + 540) % 360) - 180, y / rad];
  });
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
}
