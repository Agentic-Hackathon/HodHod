import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Shop } from "../../data/types";
import { useStore } from "../../state/store";
import {
  Button,
  EmptyState,
  NoRouteFound,
  PartialDataState,
} from "../../components/primitives";
import { DirectionsAction, DistanceAndETA } from "../../components/commerce";
import { MapPin } from "lucide-react";
import { radiusPolygon } from "./geography";
import { uiEvents } from "../../state/events";
export function StoreMap({
  shops,
  onSelect,
}: {
  shops: Shop[];
  onSelect: (s: Shop) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { session: s, set, filter } = useStore();
  const [error, setError] = useState("");
  const [moved, setMoved] = useState(false);
  const [pin, setPin] = useState(false);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const shopRef = useRef(shops);
  shopRef.current = shops;
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const valid = shops.filter((x) => x.lat !== null && x.lon !== null);
  const selected = shops.find((x) => x.id === s.selectedShop);
  useEffect(() => {
    if (!container.current) return;
    let timer: ReturnType<typeof setTimeout>;
    try {
      const m = new maplibregl.Map({
        container: container.current,
        style: import.meta.env.VITE_MAP_STYLE || {
          version: 8,
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          sources: {
            osm: {
              type: "raster",
              tiles: [
                import.meta.env.VITE_MAP_TILE_URL ||
                  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "osm" }],
        },
        center: s.viewport
          ? [s.viewport.lng, s.viewport.lat]
          : [s.location?.lon || 51.4107, s.location?.lat || 35.6953],
        zoom: s.viewport?.zoom || 12,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.addControl(new maplibregl.NavigationControl(), "top-left");
      timer = setTimeout(() => {
        if (!m.isStyleLoaded())
          setError("نقشه دریافت نشد؛ فهرست فروشگاه‌ها همچنان در دسترس است.");
      }, 12000);
      m.on("error", () =>
        setError("بخشی از نقشه دریافت نشد؛ می‌توانید از فهرست استفاده کنید."),
      );
      m.on("moveend", (e) => {
        if (e.originalEvent) setMoved(true);
        const c = m.getCenter();
        set({ viewport: { lng: c.lng, lat: c.lat, zoom: m.getZoom() } });
      });
      m.on("dragend", () => setMoved(true));
      m.on("click", (e) => {
        if (pinRef.current) {
          set({
            location: {
              lat: e.lngLat.lat,
              lon: e.lngLat.lng,
              label: "نقطهٔ روی نقشه",
            },
          });
          setPin(false);
          uiEvents.emit({
            type: "location.change",
            payload: { lat: e.lngLat.lat, lon: e.lngLat.lng },
          });
          return;
        }
        const hits = m.getLayer("shop-points")
          ? m.queryRenderedFeatures(e.point, { layers: ["shop-points"] })
          : [];
        const id = hits[0]?.properties?.id;
        const shop = shopRef.current.find((x) => x.id === id);
        if (shop) {
          set({ selectedShop: shop.id });
          uiEvents.emit({ type: "shop.select", payload: { shopId: shop.id } });
          callback.current(shop);
          document
            .getElementById("store-" + shop.id)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        const clusters = m.getLayer("clusters")
          ? m.queryRenderedFeatures(e.point, { layers: ["clusters"] })
          : [];
        if (clusters[0]) {
          const src = m.getSource("shops") as GeoJSONSource;
          src
            .getClusterExpansionZoom(Number(clusters[0].properties?.cluster_id))
            .then((zoom) =>
              m.easeTo({
                center: (clusters[0].geometry as { coordinates: number[] })
                  .coordinates as [number, number],
                zoom,
              }),
            );
        }
      });
      m.on("style.load", () => {
        clearTimeout(timer);
        setError("");
        m.addSource("shops", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 45,
        });
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "shops",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#ee4939",
            "circle-radius": 22,
            "circle-opacity": 0.85,
          },
        });
        m.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "shops",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 13,
            "text-font": ["Noto Sans Regular"],
          },
          paint: { "text-color": "#fff" },
        });
        m.addLayer({
          id: "shop-points",
          type: "circle",
          source: "shops",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#ee4939",
            "circle-radius": 9,
            "circle-stroke-color": "white",
            "circle-stroke-width": 3,
          },
        });
        m.addSource("selection", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "selection-ring",
          source: "selection",
          type: "circle",
          paint: {
            "circle-radius": 16,
            "circle-color": "transparent",
            "circle-stroke-color": "#202a36",
            "circle-stroke-width": 3,
          },
        });
        m.addSource("user", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "user-point",
          source: "user",
          type: "circle",
          paint: {
            "circle-color": "#2563eb",
            "circle-radius": 8,
            "circle-stroke-color": "white",
            "circle-stroke-width": 3,
          },
        });
        update();
      });
      function update() {
        const source = m.getSource("shops") as GeoJSONSource | undefined;
        source?.setData({
          type: "FeatureCollection",
          features: shopRef.current
            .filter((x) => x.lat !== null && x.lon !== null)
            .map((x) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [x.lon!, x.lat!] },
              properties: { id: x.id, name: x.name },
            })),
        });
      }
      return () => {
        clearTimeout(timer);
        m.remove();
        map.current = null;
      };
    } catch {
      setError(
        "نقشه در این دستگاه قابل اجرا نیست؛ فهرست جایگزین در دسترس است.",
      );
    }
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const update = () => {
      (m.getSource("shops") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: valid.map((x) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [x.lon!, x.lat!] },
          properties: { id: x.id },
        })),
      });
      if (valid.length && !s.viewport) {
        const b = new maplibregl.LngLatBounds();
        valid.forEach((x) => b.extend([x.lon!, x.lat!]));
        m.fitBounds(b, { padding: 55, maxZoom: 14, duration: 500 });
      }
    };
    if (m.getSource("shops")) update();
    else m.once("style.load", update);
  }, [shops]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const update = () => {
      (m.getSource("selection") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features:
          selected?.lat !== null &&
          selected?.lat !== undefined &&
          selected.lon !== null
            ? [
                {
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [selected.lon, selected.lat],
                  },
                  properties: {},
                },
              ]
            : [],
      });
      if (
        selected?.lat !== null &&
        selected?.lat !== undefined &&
        selected.lon !== null
      )
        m.easeTo({ center: [selected.lon, selected.lat], duration: 450 });
      (m.getSource("user") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: s.location
          ? [
              {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [s.location.lon, s.location.lat],
                },
                properties: {},
              },
            ]
          : [],
      });
    };
    if (m.getSource("user")) update();
    else m.once("style.load", update);
  }, [s.selectedShop, s.location]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const update = () => {
      const data = {
        type: "FeatureCollection" as const,
        features:
          s.location && s.filters.nearby
            ? [radiusPolygon(s.location, s.filters.radius)]
            : [],
      };
      const source = m.getSource("search-radius") as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        m.addSource("search-radius", { type: "geojson", data });
        m.addLayer(
          {
            id: "radius-fill",
            type: "fill",
            source: "search-radius",
            paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
          },
          "clusters",
        );
        m.addLayer(
          {
            id: "radius-border",
            type: "line",
            source: "search-radius",
            paint: {
              "line-color": "#2563eb",
              "line-width": 2,
              "line-dasharray": [3, 2],
            },
          },
          "clusters",
        );
      }
      if (data.features.length) {
        const bounds = new maplibregl.LngLatBounds();
        data.features[0].geometry.coordinates[0].forEach((p) =>
          bounds.extend(p as [number, number]),
        );
        m.fitBounds(bounds, { padding: 55, duration: 400 });
      }
    };
    if (m.getSource("shops")) update();
    else m.once("style.load", update);
    return () => {
      m.off("style.load", update);
    };
  }, [s.location, s.filters.nearby, s.filters.radius]);
  return (
    <section className="map-layout">
      <div className="map-frame">
        <div
          ref={container}
          className="map-container"
          aria-label="نقشهٔ فروشگاه‌ها"
        />
        <div className="map-toolbar">
          <Button onClick={() => setPin(!pin)}>
            {pin ? "روی نقشه یک نقطه بزنید" : "انتخاب موقعیت روی نقشه"}
          </Button>
          {moved && (
            <Button
              variant="primary"
              onClick={() => {
                const b = map.current?.getBounds();
                if (b) {
                  filter({
                    bounds: [
                      b.getWest(),
                      b.getSouth(),
                      b.getEast(),
                      b.getNorth(),
                    ].join(","),
                    nearby: false,
                  });
                  set({ scene: "map" });
                  setMoved(false);
                }
              }}
            >
              در این محدوده جست‌وجو کن
            </Button>
          )}
        </div>
        {error && (
          <div className="map-error">
            <PartialDataState>{error}</PartialDataState>
          </div>
        )}
      </div>
      <div className="map-store-list">
        {valid.length ? (
          valid.map((shop) => (
            <button
              key={shop.id}
              id={"store-" + shop.id}
              className={`map-store ${s.selectedShop === shop.id ? "selected" : ""}`}
              onClick={() => {
                set({ selectedShop: shop.id });
                onSelect(shop);
              }}
            >
              <span className="store-pin">
                <MapPin size={19} />
              </span>
              <span>
                <strong>{shop.name}</strong>
                <DistanceAndETA shop={shop} location={s.location} />
              </span>
              <span>←</span>
            </button>
          ))
        ) : (
          <EmptyState title="فروشگاهی با مختصات در این نتایج نیست" />
        )}
      </div>
    </section>
  );
}
export function RoutePreview({ shop }: { shop: Shop }) {
  return (
    <div className="section">
      <NoRouteFound />
      <DirectionsAction shop={shop} />
    </div>
  );
}
export const StoreMarkerCluster = StoreMap;
export const MapListSync = StoreMap;
export const NearMeResults = StoreMap;
export function MapBoundsSearch({ onSearch }: { onSearch: () => void }) {
  return <Button onClick={onSearch}>در این محدوده جست‌وجو کن</Button>;
}
