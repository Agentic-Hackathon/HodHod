import Dexie, { type EntityTable } from "dexie";
import { create } from "zustand";
import { uiEvents } from "./events";
import type { AgentContext } from '../agent/backend';
import type {
  ShoppingMission,
  MissionResponse,
  VisitReport,
  VisitOutcome,
} from "../features/mission/types";
import type { UIBlock } from "../generative-ui/schema";
import type {
  Filters,
  Location,
  Scene,
  Product,
  Shop,
  Offer,
} from "../data/types";
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}
export interface Session {
  agentContext?: AgentContext;
  mission?: ShoppingMission;
  visitReports?: VisitReport[];
  missionSnapshot?: { key: string; response: MissionResponse };
  resultSnapshot?: {
    productIds: string[];
    shopIds: string[];
    offerIds: string[];
    total: number;
    page: number;
    blocks: UIBlock[];
  };
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
  filters: Filters;
  location: Location | null;
  scene: Scene;
  selectedProduct: string | null;
  selectedShop: string | null;
  selectedOffer: string | null;
  compare: string[];
  saved: string[];
  plans: {
    id: string;
    offerId: string;
    createdAt: string;
    checks: string[];
    quantity?: number;
    departure?: string;
  }[];
  viewport: { lng: number; lat: number; zoom: number } | null;
  priority: "price" | "distance" | "balance";
  entities: {
    products: Record<string, Product>;
    shops: Record<string, Shop>;
    offers: Record<string, Offer>;
  };
}
export const initialFilters: Filters = {
  priceStatus: "all",
  query: "",
  category: "",
  min: "",
  max: "",
  radius: 1,
  nearby: false,
};
export const fresh = (): Session => ({
  id: crypto.randomUUID(),
  title: "خرید تازه",
  updatedAt: new Date().toISOString(),
  messages: [],
  filters: { ...initialFilters },
  location: null,
  scene: "welcome",
  selectedProduct: null,
  selectedShop: null,
  selectedOffer: null,
  compare: [],
  saved: [],
  plans: [],
  viewport: null,
  priority: "balance",
  entities: { products: {}, shops: {}, offers: {} },
});
export const db = new Dexie("torob-workspace") as Dexie & {
  sessions: EntityTable<Session, "id">;
};
db.version(1).stores({ sessions: "id,updatedAt,title" });
db.version(2)
  .stores({ sessions: "id,updatedAt,title" })
  .upgrade((tx) =>
    tx
      .table("sessions")
      .toCollection()
      .modify((s) => {
        s.entities ??= { products: {}, shops: {}, offers: {} };
        s.plans ??= [];
        s.viewport ??= null;
        s.priority ??= "balance";
      }),
  );
interface Store {
  session: Session;
  hydrated: boolean;
  persistenceError: string;
  set: (patch: Partial<Session>) => void;
  filter: (patch: Partial<Filters>) => void;
  message: (role: Message["role"], text: string) => void;
  remember: (products: Product[], shops: Shop[], offers: Offer[]) => void;
  restore: (session: Session) => void;
  newSession: (discardCurrent?: boolean) => void;
  toggleCompare: (id: string) => void;
  toggleSave: (id: string) => void;
  reportVisit: (offer: Offer, outcome: VisitOutcome) => void;
}
export const useStore = create<Store>((set, get) => ({
  session: fresh(),
  hydrated: false,
  persistenceError: "",
  reportVisit: (offer, outcome) => {
    const session = get().session;
    if (!session.mission) return;
    const report: VisitReport = {
      id: crypto.randomUUID(),
      missionId: session.mission.id,
      offerId: offer.id,
      shopId: offer.shopId,
      outcome,
      at: new Date().toISOString(),
    };
    get().set({ visitReports: [...(session.visitReports || []), report] });
    uiEvents.emit({ type: "visit.report", payload: { ...report } });
  },
  set: (patch) =>
    set((s) => ({
      session: { ...s.session, ...patch, updatedAt: new Date().toISOString() },
    })),
  filter: (patch) => {
    get().set({
      filters: { ...get().session.filters, ...patch },
      scene: "results",
    });
    uiEvents.emit({
      type:
        patch.category !== undefined
          ? "category.select"
          : patch.bounds !== undefined
            ? "map.bounds.change"
            : "filter.change",
      payload: { ...patch },
    });
  },
  message: (role, text) => {
    const s = get().session;
    get().set({
      messages: [...s.messages, { id: crypto.randomUUID(), role, text }],
      title:
        s.messages.length === 0 && role === "user"
          ? text.slice(0, 50)
          : s.title,
    });
  },
  remember: (products, shops, offers) => {
    const e = get().session.entities;
    get().set({
      entities: {
        products: {
          ...e.products,
          ...Object.fromEntries(products.map((x) => [x.id, x])),
        },
        shops: {
          ...e.shops,
          ...Object.fromEntries(shops.map((x) => [x.id, x])),
        },
        offers: {
          ...e.offers,
          ...Object.fromEntries(offers.map((x) => [x.id, x])),
        },
      },
    });
  },
  restore: (session) => {
    if (get().session.id !== session.id)
      db.sessions.put(get().session).catch(() => {});
    set({ session });
  },
  newSession: (discardCurrent = false) => {
    clearTimeout(timer);
    if (!discardCurrent) db.sessions.put(get().session).catch(() => {});
    set({ session: fresh() });
  },
  toggleCompare: (id) => {
    const a = get().session.compare;
    get().set({
      compare: a.includes(id)
        ? a.filter((x) => x !== id)
        : a.length < 4
          ? [...a, id]
          : a,
    });
    uiEvents.emit({
      type: a.includes(id) ? "compare.remove" : "compare.add",
      payload: { productId: id },
    });
  },
  toggleSave: (id) => {
    const a = get().session.saved;
    get().set({
      saved: a.includes(id) ? a.filter((x) => x !== id) : [...a, id],
    });
  },
}));
let timer: ReturnType<typeof setTimeout>;
useStore.subscribe((s) => {
  if (!s.hydrated) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    db.sessions
      .put(s.session)
      .then(() => localStorage.setItem("torob-session", s.session.id))
      .catch(() =>
        useStore.setState({
          persistenceError: "ذخیرهٔ تاریخچه در مرورگر ممکن نیست.",
        }),
      );
  }, 200);
});
export async function hydrate() {
  try {
    const id = localStorage.getItem("torob-session");
    if (id) {
      const s = await db.sessions.get(id);
      if (s) {
        if (
          !s.filters ||
          !s.entities ||
          !Array.isArray(s.messages) ||
          !Array.isArray(s.compare) ||
          !Array.isArray(s.saved)
        )
          throw new Error("Invalid stored session");
        useStore.setState({ session: s });
      }
    }
  } catch {
    useStore.setState({ persistenceError: "تاریخچهٔ محلی در دسترس نیست." });
  }
  useStore.setState({ hydrated: true });
}
