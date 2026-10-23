export type TravelMode = "walking" | "driving";
export interface Route {
  geometry: { type: "LineString"; coordinates: number[][] };
  distanceMeters: number;
  durationSeconds: number;
  mode: TravelMode;
  liveTraffic: false;
}
const routeSignal = (signal?: AbortSignal) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
    : AbortSignal.timeout(8000);
export interface RoutingProvider {
  getStatus(): Promise<"available" | "unavailable">;
  getRoute(
    from: [number, number],
    to: [number, number],
    mode: TravelMode,
    signal?: AbortSignal,
  ): Promise<Route | null>;
  getDistanceMatrix(
    points: [number, number][],
    mode: TravelMode,
    signal?: AbortSignal,
  ): Promise<(number | null)[][] | null>;
}
export class RoutingUnavailable implements RoutingProvider {
  async getStatus() {
    return "unavailable" as const;
  }
  async getRoute() {
    return null;
  }
  async getDistanceMatrix() {
    return null;
  }
}
// Configure one endpoint per prepared profile; never silently use a car profile for walking.
export class OSRMProvider implements RoutingProvider {
  constructor(
    private endpoint: string,
    private supportedMode: TravelMode = "driving",
  ) {}
  async getStatus() {
    try {
      return (
        await fetch(
          this.endpoint +
            `/nearest/v1/${this.supportedMode}/51.4107,35.6953?number=1`,
          { signal: routeSignal() },
        )
      ).ok
        ? ("available" as const)
        : ("unavailable" as const);
    } catch {
      return "unavailable" as const;
    }
  }
  async getRoute(
    from: [number, number],
    to: [number, number],
    mode: TravelMode,
    signal?: AbortSignal,
  ) {
    if (mode !== this.supportedMode) return null;
    try {
      const r = await fetch(
        `${this.endpoint}/route/v1/${mode}/${from.join(",")};${to.join(",")}?geometries=geojson&overview=full`,
        { signal: routeSignal(signal) },
      );
      const d = await r.json();
      if (d.code !== "Ok" || !d.routes?.[0]) return null;
      const v = d.routes[0];
      if (
        v.geometry?.type !== "LineString" ||
        !Array.isArray(v.geometry.coordinates) ||
        !v.geometry.coordinates.every(
          (p: unknown) =>
            Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite),
        ) ||
        !Number.isFinite(v.distance) ||
        v.distance < 0 ||
        !Number.isFinite(v.duration) ||
        v.duration < 0
      )
        return null;
      return {
        geometry: d.routes[0].geometry,
        distanceMeters: d.routes[0].distance,
        durationSeconds: d.routes[0].duration,
        mode,
        liveTraffic: false as const,
      };
    } catch {
      return null;
    }
  }
  async getDistanceMatrix(
    points: [number, number][],
    mode: TravelMode,
    signal?: AbortSignal,
  ) {
    if (mode !== this.supportedMode) return null;
    try {
      const r = await fetch(
        `${this.endpoint}/table/v1/${mode}/${points.map((p) => p.join(",")).join(";")}`,
        { signal: routeSignal(signal) },
      );
      const d = await r.json();
      return d.code === "Ok" ? d.durations : null;
    } catch {
      return null;
    }
  }
}
