import type { Offer, Product, Shop, Location } from "../../data/types";
import { haversine } from "../../i18n/format";
export interface Candidate {
  offer: Offer;
  shop: Shop;
  product?: Product;
  distance: number;
  pareto: boolean;
  number: number;
}
export function candidates(
  offers: Offer[],
  shops: Shop[],
  products: Record<string, Product>,
  location: Location | null,
): Candidate[] {
  const seen = new Set<string>();
  const list = offers.flatMap((offer) => {
    if (seen.has(offer.id)) return [];
    seen.add(offer.id);
    const shop = shops.find((x) => x.id === offer.shopId);
    if (
      offer.price === null ||
      !location ||
      shop?.lat == null ||
      shop.lon === null
    )
      return [];
    return [
      {
        offer,
        shop,
        product: products[offer.productId],
        distance: haversine(location, { lat: shop.lat, lon: shop.lon }),
        pareto: false,
        number: seen.size,
      },
    ];
  });
  return list.map((c, i) => ({
    ...c,
    number: i + 1,
    pareto: !list.some(
      (o) =>
        o.offer.price! <= c.offer.price! &&
        o.distance <= c.distance &&
        (o.offer.price! < c.offer.price! || o.distance < c.distance),
    ),
  }));
}
export function groupOffers(offers: Offer[]) {
  const groups = new Map<string, Offer[]>();
  for (const o of offers) {
    const key = o.productId + ":" + o.shopId;
    const a = groups.get(key) || [];
    if (!a.some((x) => x.id === o.id)) a.push(o);
    groups.set(key, a);
  }
  return [...groups.values()].map((a) =>
    a.sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity)),
  );
}
export function normalizeFeature(v: string) {
  return v
    .normalize("NFKC")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s\u200c]+/g, " ")
    .trim();
}
