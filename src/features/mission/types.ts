import type { Offer, Product, Shop } from "../../data/types";
import type { TravelMode } from "../maps/routing";

export interface ShoppingMission {
  id: string;
  query: string;
  required: string;
  category?: string;
  departure: string;
  mode: TravelMode;
  radius: number;
  max: string;
  shoppingMinutes: number;
  onlyReady: boolean;
}
export type VisitOutcome =
  "confirmed" | "no_answer" | "sold_out" | "closed" | "purchased";
export interface VisitReport {
  id: string;
  missionId: string;
  offerId: string;
  shopId: string;
  outcome: VisitOutcome;
  at: string;
}
export interface MissionEntry {
  offer: Offer;
  product: Product;
  shop: Shop;
  distance: number;
  departureStatus: "open" | "closed" | "unknown";
}
export interface MissionResponse {
  entries: MissionEntry[];
  totalShops: number;
  shortlisted: number;
  searchedRadius: number;
  nearby: { open: number; closed: number; unknown: number };
  source: "dataset";
  departure: string;
}
export interface ExplorationPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  openingHours: string | null;
  sourceUrl: string;
  inventory: "unknown";
  membership: "unknown";
}
export interface ExplorationResponse {
  status: "ready" | "unavailable";
  places: ExplorationPlace[];
  source: "OpenStreetMap";
  fetchedAt: number;
}
