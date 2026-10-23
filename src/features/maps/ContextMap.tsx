import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Location, Shop } from "../../data/types";
import { radiusPolygon } from "./geography";
import { fa } from "../../i18n/format";

export function ContextMap({
  origin,
  radius,
  shops = [],
  onSelect,
  selectedShop,
}: {
  origin: Location | null;
  radius?: number;
  shops?: Shop[];
  onSelect?: (shop: Shop) => void;
  selectedShop?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [cluster, setCluster] = useState<Shop[]>([]);
  const selectedRef = useRef(selectedShop);
  selectedRef.current = selectedShop;
  const select = useRef(onSelect);
  select.current = onSelect;
  const signature = JSON.stringify([
    origin,
    radius,
    shops.map((s) => [s.id, s.lat, s.lon, s.name]),
  ]);
  useEffect(() => {
    const center = origin || shops.find((s) => s.lat != null && s.lon != null);
    if (
      !container.current ||
      !center ||
      center.lat == null ||
      center.lon == null
    )
      return;
    let map: maplibregl.Map | undefined;
    setError(false);
    setCluster([]);
    try {
      map = new maplibregl.Map({
        container: container.current,
        center: [center.lon, center.lat],
        zoom: 13,
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
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "osm" }],
        },
        attributionControl: { compact: true },
      });
      const m = map;
      m.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-left",
      );
      const bounds = new maplibregl.LngLatBounds(
        [center.lon, center.lat],
        [center.lon, center.lat],
      );
      const user = document.createElement("div");
      user.className = "context-user";
      user.textContent = "شما";
      if (origin)
        new maplibregl.Marker({ element: user, offset: [0, -34] })
          .setLngLat([origin.lon, origin.lat])
          .addTo(m);
      user.setAttribute("role", "img");
      user.setAttribute("aria-label", "موقعیت شما");
      const valid = shops.filter((s) => s.lat != null && s.lon != null);
      valid.forEach((shop) => bounds.extend([shop.lon!, shop.lat!]));
      let markers: maplibregl.Marker[] = [];
      const renderMarkers = () => {
        markers.forEach((marker) => marker.remove());
        markers = [];
        const groups: { point: maplibregl.Point; shops: Shop[] }[] = [];
        valid.forEach((shop) => {
          const point = m.project([shop.lon!, shop.lat!]);
          const group = groups.find(
            (g) => Math.hypot(g.point.x - point.x, g.point.y - point.y) < 44,
          );
          if (group) group.shops.push(shop);
          else groups.push({ point, shops: [shop] });
        });
        groups.forEach((group) => {
          const shop = group.shops[0];
          const i = valid.findIndex((s) => s.id === shop.id);
          const el = document.createElement("button");
          el.type = "button";
          const many = group.shops.length > 1;
          el.className = "context-shop" + (many ? " context-cluster" : "");
          el.textContent = many ? `+${fa(group.shops.length)}` : fa(i + 1);
          el.setAttribute(
            "aria-label",
            many
              ? `${fa(group.shops.length)} فروشگاه نزدیک به هم`
              : `${fa(i + 1)}. ${shop.name}`,
          );
          el.title = el.getAttribute("aria-label")!;
          el.dataset.shopIds = group.shops.map((s) => s.id).join(",");
          const active = group.shops.some((s) => s.id === selectedRef.current);
          el.classList.toggle("selected", active);
          el.setAttribute("aria-pressed", String(active));
          el.onclick = () =>
            many ? setCluster(group.shops) : select.current?.(shop);
          markers.push(
            new maplibregl.Marker({ element: el })
              .setLngLat([shop.lon!, shop.lat!])
              .addTo(m),
          );
        });
      };
      if (radius && origin)
        radiusPolygon(origin, radius).geometry.coordinates[0].forEach((p) =>
          bounds.extend(p as [number, number]),
        );
      m.fitBounds(bounds, { padding: 55, maxZoom: 15, duration: 0 });
      renderMarkers();
      m.on("moveend", renderMarkers);
      m.on("style.load", () => {
        if (!radius || !origin) return;
        m.addSource("search-radius", {
          type: "geojson",
          data: radiusPolygon(origin, radius),
        });
        m.addLayer({
          id: "radius-fill",
          type: "fill",
          source: "search-radius",
          paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
        });
        m.addLayer({
          id: "radius-border",
          type: "line",
          source: "search-radius",
          paint: {
            "line-color": "#2563eb",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
      });
      m.on("error", () => setError(true));
      const observer = new ResizeObserver(() => {
        m.resize();
        renderMarkers();
      });
      observer.observe(container.current);
      return () => {
        observer.disconnect();
        m.remove();
      };
    } catch {
      setError(true);
      map?.remove();
    }
  }, [signature]);
  useEffect(() => {
    container.current
      ?.querySelectorAll<HTMLElement>("[data-shop-ids]")
      .forEach((el) => {
        const selected =
          el.dataset.shopIds?.split(",").includes(selectedShop || "") || false;
        el.classList.toggle("selected", selected);
        el.setAttribute("aria-pressed", String(selected));
      });
  }, [selectedShop, signature]);
  return (
    <div className="context-map" data-radius-km={radius}>
      <div
        ref={container}
        className="context-map-canvas"
        role="region"
        aria-label="نقشهٔ موقعیت شما و فروشگاه‌های مقایسه"
      />
      {cluster.length > 0 && (
        <div
          className="context-cluster-picker"
          role="group"
          aria-label="فروشگاه‌های این محدوده"
        >
          <div>
            <strong>{fa(cluster.length)} فروشگاه در این محدوده</strong>
            <button
              type="button"
              onClick={() => setCluster([])}
              aria-label="بستن فهرست نشانگرها"
            >
              ×
            </button>
          </div>
          {cluster.map((shop) => (
            <button
              key={shop.id}
              type="button"
              onClick={() => {
                select.current?.(shop);
                setCluster([]);
              }}
            >
              {fa(shops.findIndex((s) => s.id === shop.id) + 1)}. {shop.name}
            </button>
          ))}
        </div>
      )}
      {!origin && (
        <p className="context-map-status">
          برای دیدن فاصله‌ها، موقعیت خود را انتخاب کنید.
        </p>
      )}
      {origin && radius && (
        <span className="context-map-key">
          شعاع {fa(radius)} کیلومتر از موقعیت شما
        </span>
      )}
      {error && (
        <span className="context-map-status">دریافت زمینهٔ نقشه کامل نشد.</span>
      )}
    </div>
  );
}
