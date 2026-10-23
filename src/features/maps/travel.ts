import { useEffect, useState } from "react";
import type { Shop } from "../../data/types";
import { useStore } from "../../state/store";
import type { Route, TravelMode } from "./routing";
export interface TravelRoute extends Route {
  status: "ready";
  source: string;
  calculatedAt: number;
  steps: { name: string; distance: number; type: string; modifier: string }[];
}
export interface TravelState {
  driving: TravelRoute | null;
  walking: TravelRoute | null;
  busy: boolean;
  attempted: boolean;
}
const cache = new Map<string, Promise<TravelRoute | null>>();
export function fetchTravel(
  shopId: string,
  lat: number,
  lon: number,
  mode: TravelMode,
): Promise<TravelRoute | null> {
  const key = [shopId, lat, lon, mode].join(":");
  const existing = cache.get(key);
  if (existing) return existing;
  const p = fetch(
    "/api/route?" +
      new URLSearchParams({ shopId, lat: String(lat), lon: String(lon), mode }),
    { signal: AbortSignal.timeout(45000) },
  )
    .then(async (r) => {
      if (!r.ok) return null;
      const data = await r.json();
      return data.status === "ready" &&
        data.mode === mode &&
        Number.isFinite(data.distanceMeters) &&
        Number.isFinite(data.durationSeconds)
        ? (data as TravelRoute)
        : null;
    })
    .catch(() => null);
  cache.set(key, p);
  p.then((v) => {
    if (!v) cache.delete(key);
  });
  setTimeout(() => cache.delete(key), 900000);
  return p;
}
export function useTravelRoutes(shop: Shop | undefined, auto = false) {
  const location = useStore((s) => s.session.location);
  const [retry, setRetry] = useState(0);
  const [requested, setRequested] = useState(auto);
  const [state, setState] = useState<TravelState>({
    driving: null,
    walking: null,
    busy: false,
    attempted: false,
  });
  useEffect(() => {
    setRequested(auto);
    setState({ driving: null, walking: null, busy: false, attempted: false });
  }, [shop?.id, location?.lat, location?.lon, auto]);
  useEffect(() => {
    if (
      !requested ||
      !location ||
      !shop ||
      shop.lat === null ||
      shop.lon === null
    )
      return;
    let active = true;
    setState({ driving: null, walking: null, busy: true, attempted: true });
    Promise.all([
      fetchTravel(shop.id, location.lat, location.lon, "driving"),
      fetchTravel(shop.id, location.lat, location.lon, "walking"),
    ]).then(([driving, walking]) => {
      if (active) setState({ driving, walking, busy: false, attempted: true });
    });
    return () => {
      active = false;
    };
  }, [shop?.id, location?.lat, location?.lon, requested, retry]);
  return {
    ...state,
    calculate: () => {
      setRequested(true);
      setRetry((v) => v + 1);
    },
  };
}
