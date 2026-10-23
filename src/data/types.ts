export interface Product {
  id: string;
  title: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  images: string[];
  specs: { key: string; section: string; value: string }[];
}
export interface Shop {
  id: string;
  name: string;
  address: string | null;
  area: string | null;
  lat: number | null;
  lon: number | null;
  categories: string[];
  hours: Record<
    string,
    { status: string; shifts: { start_time: string; end_time: string }[] }
  >;
  payments: unknown[];
  fastDelivery: boolean | null;
  website: string | null;
  instagram: string | null;
  syntheticPhone: boolean;
  syntheticName: boolean;
}
export interface Offer {
  id: string;
  productId: string;
  shopId: string;
  price: number | null;
  currency: string;
  changedAt: string | null;
  title: string | null;
  description: string | null;
  warranty: unknown;
  inventoryVerified: false;
}
export interface Results {
  products: Product[];
  offers: Offer[];
  shops: Shop[];
  total: number;
  page: number;
  source: "dataset";
}
export interface Filters {
  priceStatus?: "all" | "known" | "unknown";
  payment?: string;
  inPersonOnly?: boolean;
  warranty?: boolean;
  query: string;
  category: string;
  min: string;
  max: string;
  radius: number;
  nearby: boolean;
  bounds?: string;
  shop?: string;
}
export interface Location {
  lat: number;
  lon: number;
  label: string;
}
export type Scene =
  | "mission"
  | "welcome"
  | "results"
  | "categories"
  | "map"
  | "compare"
  | "decision"
  | "visit"
  | "saved"
  | "gallery";
export type ActionType =
  | "agent.clarify"
  | "catalog.browse"
  | "mission.start"
  | "mission.change"
  | "mission.replan"
  | "visit.report"
  | "message.send"
  | "category.select"
  | "filter.change"
  | "location.change"
  | "map.bounds.change"
  | "product.select"
  | "shop.select"
  | "offer.select"
  | "compare.add"
  | "compare.remove"
  | "route.request"
  | "visit.save"
  | "session.restore"
  | "image.attach"
  | "voice.transcription.edit";
export interface Action {
  type: ActionType;
  payload?: Record<string, unknown>;
}
