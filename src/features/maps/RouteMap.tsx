import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TravelRoute } from "./travel";
export default function RouteMap({ route }: { route: TravelRoute }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let m: maplibregl.Map | undefined;
    try {
      const points = route.geometry.coordinates;
      const start = points[0] as [number, number];
      m = new maplibregl.Map({
        container: container.current,
        style: import.meta.env.VITE_MAP_STYLE || {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                import.meta.env.VITE_MAP_TILE_URL ||
                  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [{ id: "base", type: "raster", source: "osm" }],
        },
        center: start,
        zoom: 14,
      });
      m.addControl(new maplibregl.NavigationControl(), "top-left");
      m.on("error", () => setFailed(true));
      m.on("style.load", () => {
        m!.addSource("route", {
          type: "geojson",
          data: { type: "Feature", geometry: route.geometry, properties: {} },
        });
        m!.addLayer({
          id: "route-shadow",
          type: "line",
          source: "route",
          paint: { "line-color": "#fff", "line-width": 9 },
        });
        m!.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": route.mode === "walking" ? "#478572" : "#de4c38",
            "line-width": 5,
          },
        });
        new maplibregl.Marker({ color: "#478572" }).setLngLat(start).addTo(m!);
        new maplibregl.Marker({ color: "#de4c38" })
          .setLngLat(points[points.length - 1] as [number, number])
          .addTo(m!);
        const b = new maplibregl.LngLatBounds();
        points.forEach((p) => b.extend(p as [number, number]));
        m!.fitBounds(b, { padding: 45, maxZoom: 16, duration: 0 });
      });
    } catch {
      setFailed(true);
    }
    return () => m?.remove();
  }, [route]);
  return (
    <div className="route-map-wrap">
      <div
        ref={container}
        className="route-map"
        aria-label={
          route.mode === "walking" ? "نقشهٔ مسیر پیاده" : "نقشهٔ مسیر خودرو"
        }
      />
      {failed && (
        <small className="route-map-note">
          زمینهٔ نقشه دریافت نشد؛ مسیر و راهنما همچنان در دسترس‌اند.
        </small>
      )}
    </div>
  );
}
