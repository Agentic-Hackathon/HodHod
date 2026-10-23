import type { Filters, Location, Results, Product, Shop, Offer } from "./types";
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api/" + path, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(
      "ارتباط با سرویس داده برقرار نیست. آخرین اطلاعات ذخیره‌شده قابل مشاهده است.",
    );
  }
  if (!r.ok)
    throw new Error("دریافت داده انجام نشد؛ سرویس محلی داده را بررسی کنید.");
  return r.json();
}
export function search(
  filters: Filters,
  location: Location | null,
  page = 0,
  signal?: AbortSignal,
) {
  const p = new URLSearchParams({
    q: filters.query,
    category: filters.category,
    min: filters.min,
    max: filters.max,
    page: String(page),
  });
  if (filters.priceStatus) p.set("priceStatus", filters.priceStatus);
  if (filters.payment) p.set("payment", filters.payment);
  if (filters.inPersonOnly) p.set("inPerson", "1");
  if (filters.warranty) p.set("warranty", "1");
  if (filters.nearby && location) {
    p.set("lat", String(location.lat));
    p.set("lon", String(location.lon));
    p.set("radius", String(filters.radius));
  }
  if (filters.bounds) p.set("bounds", filters.bounds);
  if (filters.shop) p.set("shop", filters.shop);
  return api<Results>("search?" + p, signal);
}
export async function entities<K extends "products" | "shops" | "offers">(
  kind: K,
  ids: string[],
  signal?: AbortSignal,
): Promise<
  (K extends "products" ? Product : K extends "shops" ? Shop : Offer)[]
> {
  if (!ids.length) return [];
  return api(
    "entities?" + new URLSearchParams({ kind, ids: ids.join(",") }),
    signal,
  );
}
