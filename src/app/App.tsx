import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  ChevronLeft,
  Compass,
  FlaskConical,
  GitCompareArrows,
  HelpCircle,
  History,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useStore, hydrate, initialFilters } from "../state/store";
import { uiEvents } from "../state/events";
import { api, entities } from "../data/api";
import type {
  Action,
  Product,
  Shop,
  Offer,
  Results,
  Scene,
} from "../data/types";
import {
  DemoAgentAdapter,
  RemoteAgentAdapter,
  LatestRequest,
  type AgentAdapter,
} from "../agent/adapters";
import { EnvelopeSchema, type UIBlock } from "../generative-ui/schema";
import {
  GenerativeCanvasRenderer,
  RegistryContext,
  UIComponentRegistry,
} from "../generative-ui/registry";
import { ChatPanel, ConversationHistory } from "../features/chat/ChatPanel";
import * as P from "../components/primitives";
import * as C from "../components/commerce";
import * as D from "../components/discovery";
import * as Q from "../components/comparison";
import { ComparisonWorkspace } from "../components/ComparisonWorkspace";
import { createMission, missionFromText } from "../features/mission/decision";
const ShoppingMissionWorkspace = lazy(() =>
  import("../features/mission/ShoppingMission").then((m) => ({
    default: m.ShoppingMissionWorkspace,
  })),
);
import { fa } from "../i18n/format";
import { BackendAgentAdapter, type BackendStatus } from "../agent/backend";
import { AgentClarification } from "../components/AgentClarification";
import { scenarios } from "../demo/scenarios";
const StoreMap = lazy(() =>
  import("../features/maps/StoreMap").then((m) => ({ default: m.StoreMap })),
);
const demo = new DemoAgentAdapter();
const brain = new BackendAgentAdapter();
const remote = new RemoteAgentAdapter(
  import.meta.env.VITE_AGENT_ENDPOINT || "",
);
const latest = new LatestRequest();
const empty: Results = {
  products: [],
  shops: [],
  offers: [],
  total: 0,
  page: 0,
  source: "dataset",
};
export function AppShell() {
  const {
    session: s,
    set,
    filter,
    remember,
    message,
    hydrated,
    persistenceError,
  } = useStore();
  const [results, setResults] = useState<Results>(empty);
  const [categories, setCategories] = useState<D.Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [blocks, setBlocks] = useState<UIBlock[]>([]);
  const [lastAction, setLastAction] = useState<Action>({
    type: "filter.change",
  });
  const [remoteScene, setRemoteScene] = useState<Scene | null>(null);
  const [modal, setModal] = useState<
    "history" | "location" | "filters" | "help" | "scenarios" | null
  >(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [imageRequested, setImageRequested] = useState(0);
  const [mobile, setMobile] = useState<"chat" | "results" | "map">("results");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("torob-theme") || "light",
  );
  const [mode, setMode] = useState<"demo" | "remote" | "brain">(() => {
    const requested = new URLSearchParams(location.search).get("mode") || localStorage.getItem("hodhod-engine");
    return requested === "demo" || requested === "remote" ? requested : "brain";
  });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>();
  const consumedAction = useRef<Action | null>(null);
  const appliedConversationFilters = useRef<unknown>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [connected, setConnected] = useState(false);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [chatWidth, setChatWidth] = useState(360);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [toast, setToast] = useState("");
  const [compareTab, setCompareTab] = useState<"products" | "sellers">(
    "products",
  );
  const announce = useCallback((v: string) => {
    setToast(v);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    hydrate().then(() => {
      if (location.pathname === "/gallery") set({ scene: "gallery" });
    });
    api<D.Category[]>("categories")
      .then(setCategories)
      .catch(() => {});
    if (location.pathname === "/showcase") setModal("scenarios");
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      latest.cancel();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("torob-theme", theme);
  }, [theme]);
  useEffect(() => {
    let active = true;
    const c = new AbortController();
    (mode === "demo" ? demo : mode === "brain" ? brain : remote).getStatus(c.signal).then((v) => {
      if (active && mode === "brain") setBackendStatus(brain.status);
      if (active) setConnected(v !== "unavailable");
    });
    return () => {
      active = false;
      c.abort();
    };
  }, [mode, retry]);
  useEffect(
    () =>
      uiEvents.subscribe((a) => {
        if (mode === "remote" || (mode === "brain" && ["agent.clarify", "location.change", "filter.change", "category.select"].includes(a.type))) setLastAction(a);
      }),
    [mode],
  );
  useEffect(() => {
    const snap = s.resultSnapshot;
    if (!snap) {
      setResults(empty);
      setBlocks([]);
      return;
    }
    setResults({
      products: snap.productIds
        .map((id) => s.entities.products[id])
        .filter(Boolean),
      shops: snap.shopIds.map((id) => s.entities.shops[id]).filter(Boolean),
      offers: snap.offerIds.map((id) => s.entities.offers[id]).filter(Boolean),
      total: snap.total,
      page: snap.page,
      source: "dataset",
    });
    setBlocks(snap.blocks);
  }, [s.id, hydrated]);
  const oldFilters = useRef(s.filters);
  useEffect(() => {
    if (oldFilters.current !== s.filters) {
      setPage(0);
      oldFilters.current = s.filters;
    }
  }, [s.filters]);
  useEffect(() => {
    if (!hydrated) return;
    if (appliedConversationFilters.current === s.filters) {
      appliedConversationFilters.current = null;
      return;
    }
    const req = latest.begin();
    const sessionId = s.id;
    const requestId = crypto.randomUUID();
    setBusy(true);
    setError("");
    const adapter: AgentAdapter = mode === "demo" ? demo : mode === "brain" ? brain : remote;
    const freshAction = consumedAction.current !== lastAction;
    consumedAction.current = lastAction;
    const requestAction: Action = mode === "brain" ? freshAction ? lastAction : { type: "catalog.browse" } : mode === "remote" ? lastAction : { type: "filter.change", payload: { filters: s.filters } };
    const conversational = mode === "brain" && ["message.send", "agent.clarify"].includes(requestAction.type);
    adapter
      .dispatch(
        {
          protocolVersion: 1,
          sessionId,
          requestId,
          action: requestAction,
          messages: s.messages.map(m => ({ role: m.role, text: m.text })),
          context: { ...s.agentContext, visibleProductIds: s.resultSnapshot?.productIds.slice(0,12), selectedProductId: s.selectedProduct },
          filters: s.filters,
          location: s.location,
          page,
          mission: s.mission,
          visitReports: s.visitReports,
        },
        req.signal,
        (text) => {
          if (req.isCurrent()) setProgress(text);
        },
      )
      .then(async (reply) => {
        const e = EnvelopeSchema.parse(reply.envelope);
        if (!req.isCurrent() || useStore.getState().session.id !== sessionId)
          return;
        if (e.sessionId !== sessionId || e.requestId !== requestId)
          throw new Error("پاسخ نامرتبط دریافت شد.");
        let data = reply.results;
        if (!data) {
          const pids = [
              ...new Set(e.blocks.flatMap((b) => b.props.productIds || [])),
            ],
            oids = [
              ...new Set(e.blocks.flatMap((b) => b.props.offerIds || [])),
            ],
            sids = [...new Set(e.blocks.flatMap((b) => b.props.shopIds || []))];
          const [products, offers, shops] = await Promise.all([
            entities("products", pids, req.signal),
            entities("offers", oids, req.signal),
            entities("shops", sids, req.signal),
          ]);
          const extraProducts = await entities(
            "products",
            offers
              .map((o) => o.productId)
              .filter((id) => !products.some((p) => p.id === id)),
            req.signal,
          );
          const extraShops = await entities(
            "shops",
            offers
              .map((o) => o.shopId)
              .filter((id) => !shops.some((p) => p.id === id)),
            req.signal,
          );
          data = {
            products: [...products, ...extraProducts],
            shops: [...shops, ...extraShops],
            offers,
            total: products.length + extraProducts.length,
            page: 0,
            source: "dataset",
          };
        }
        if (!req.isCurrent()) return;
        // Applying the agent's filters can clean up this effect before finally runs.
        // Settle the accepted response first so that cleanup cannot leave it loading.
        setBusy(false);
        setProgress("");
        setResults(data);
        remember(data.products, data.shops, data.offers);
        setBlocks(e.blocks);
        set({
          resultSnapshot: {
            productIds: data.products.map((x) => x.id),
            shopIds: data.shops.map((x) => x.id),
            offerIds: data.offers.map((x) => x.id),
            total: data.total,
            page: data.page,
            blocks: e.blocks,
          },
        });
        setConnected(true);
        if (mode === "brain") {
          setBackendStatus(brain.status);
          set({ agentContext: reply.context || {} });
          if (conversational) {
            if (reply.text) message("assistant", reply.text);
            const query = reply.context?.query;
            const inferred = reply.context?.filters || {};
            const nextFilters = query ? { ...useStore.getState().session.filters, query, min: inferred.min_price == null ? '' : String(inferred.min_price), max: inferred.max_price == null ? '' : String(inferred.max_price), category: typeof inferred.category === 'string' ? inferred.category : '' } : useStore.getState().session.filters;
            if (query || page !== 0) {
              appliedConversationFilters.current = nextFilters;
              oldFilters.current = nextFilters;
              setPage(0);
            }
            set({ scene: e.scene, selectedProduct: null, selectedShop: null, selectedOffer: null,
              ...(query ? { filters: nextFilters } : {}) });
            if (e.scene === "compare") { set({ compare: data.products.slice(0,4).map(p => p.id), selectedProduct: reply.context?.compareMode === 'sellers' ? data.products[0]?.id || null : null }); setCompareTab(reply.context?.compareMode || "products"); }
            if (reply.context?.selectedOfferId) { const offer=data.offers.find(o => o.id===reply.context!.selectedOfferId); if (offer) set({ selectedOffer: offer.id, selectedShop: offer.shopId, selectedProduct: offer.productId }); }
            const intent = e.blocks.find(b => b.type === 'shopping_mission')?.props.mission;
            if (intent) set({ mission: { ...createMission(), ...intent } });
          }
        }
        if (mode === "remote") {
          set({ scene: e.scene });
          setRemoteScene(e.scene);
        }
      })
      .catch((e) => {
        if (req.isCurrent()) {
          if (mode === 'brain' && conversational) consumedAction.current = null;
          setError(
            e?.name === "ZodError"
              ? "پاسخ دستیار با قرارداد این نسخه سازگار نیست."
              : e instanceof Error
                ? e.message
                : "خطای دریافت داده",
          );
          setConnected(false);
        }
      })
      .finally(() => {
        if (req.isCurrent()) setBusy(false);
      });
    return () => {
      if (!req.signal.aborted) latest.cancel();
    };
  }, [hydrated, s.id, s.filters, s.location, page, retry, mode, lastAction]);
  const send = (text: string) => {
    message("user", text);
    if (mode === 'brain') set({ scene: 'results' });
    const urgent = missionFromText(text);
    if (mode === "demo" && urgent) {
      set({ mission: urgent, scene: "mission" });
      message(
        "assistant",
        `برای خرید فوری «${urgent.query}»، زمان رسیدن و ساعت کاری را کنار هم بررسی می‌کنم. زمان حرکت و ویژگی ضروری کالا را می‌توانید در برنامه اصلاح کنید.`,
      );
      setMobile("results");
      return;
    }
    if (mode !== "brain") filter({ query: text, category: "", bounds: undefined, shop: undefined });
    if (mode === "remote" || mode === "brain")
      setLastAction({ type: "message.send", payload: { text } });
    if (mode !== "brain") message(
      "assistant",
      mode === "demo"
        ? `جست‌وجوی «${text}» را بررسی می‌کنم.`
        : "درخواست شما برای دستیار ارسال شد.",
    );
    setMobile("results");
  };
  const action = (a: Action) => {
    if (a.type === "location.change" && a.payload?.open) {
      setModal("location");
      return;
    }
    uiEvents.emit(a);
  };
  const selectProduct = async (p: Product) => {
    const offer = Object.values(s.entities.offers).find(
      (o) => o.productId === p.id,
    );
    set({ selectedProduct: p.id, selectedShop: offer?.shopId || null });
    setProduct(p);
    action({ type: "product.select", payload: { productId: p.id } });
  };
  const selectShop = (sh: Shop) => {
    set({ selectedShop: sh.id });
    setShop(sh);
    action({ type: "shop.select", payload: { shopId: sh.id } });
  };
  const visit = (o: Offer) => {
    set({
      selectedOffer: o.id,
      selectedShop: o.shopId,
      selectedProduct: o.productId,
      scene: "visit",
    });
    setProduct(null);
    setShop(null);
    setMobile("results");
    action({ type: "offer.select", payload: { offerId: o.id } });
  };
  const selectionInResults = results.products.some(
    (p) => p.id === s.selectedProduct,
  );
  const currentOffers =
    s.selectedProduct && selectionInResults
      ? results.offers.filter((o) => o.productId === s.selectedProduct)
      : results.offers;
  const sellerOffers =
    s.selectedProduct && selectionInResults ? currentOffers : results.offers;
  const currentShops = Object.values(s.entities.shops);
  const currentProduct = s.selectedProduct
    ? s.entities.products[s.selectedProduct]
    : undefined;
  const selectedOffer = s.selectedOffer
    ? s.entities.offers[s.selectedOffer]
    : undefined;
  const selectedShop = selectedOffer
    ? s.entities.shops[selectedOffer.shopId]
    : undefined;
  const selectedProducts = s.compare
    .map((id) => s.entities.products[id])
    .filter(Boolean);
  const savedProducts = s.saved
    .map((id) => s.entities.products[id])
    .filter(Boolean);
  const renderBlock = (type: string, props: UIBlock["props"] = {}) => {
    const products = props.productIds
      ? props.productIds.map((id) => s.entities.products[id]).filter(Boolean)
      : results.products;
    const offers = props.offerIds
      ? props.offerIds.map((id) => s.entities.offers[id]).filter(Boolean)
      : results.offers;
    const shops = props.shopIds
      ? props.shopIds.map((id) => s.entities.shops[id]).filter(Boolean)
      : results.shops;
    switch (type) {
      case "shopping_plan": {
        const stops=[...new Set(offers.map(o=>o.shopId))];
        return <section className="section shopping-route-plan"><h2>برنامهٔ خرید شما</h2>
          <p className="muted small">{fa(stops.length)} توقف؛ برای مسیر و ساعت رسیدن، برنامهٔ مراجعهٔ هر فروشگاه را باز کنید.</p>
          {stops.map((id,index)=><section key={id} className="section">
            <h3>توقف {fa(index+1)} · {currentShops.find(sh=>sh.id===id)?.name}</h3>
            <C.OffersByProduct offers={offers.filter(o=>o.shopId===id)} shops={currentShops} onShop={selectShop} onVisit={visit}/>
          </section>)}
        </section>;
      }
      case "shopping_mission":
        return (
          <Suspense fallback={<P.LoadingCard />}>
            <ShoppingMissionWorkspace
              intent={props.mission}
              onLocation={() => setModal("location")}
              onVisit={visit}
            />
          </Suspense>
        );
      case "comparison_workspace": {
        const scopedProducts = props.productIds
          ? products
          : props.offerIds
            ? [...new Set(offers.map((o) => o.productId))]
                .map((id) => s.entities.products[id])
                .filter(Boolean)
            : selectedProducts;
        const ids = new Set(scopedProducts.map((p) => p.id));
        return (
          <ComparisonWorkspace
            products={scopedProducts}
            offers={
              props.offerIds
                ? offers
                : Object.values(s.entities.offers).filter((o) =>
                    ids.has(o.productId),
                  )
            }
            shops={props.shopIds ? shops : currentShops}
            mode={compareTab}
            onMode={setCompareTab}
            onVisit={visit}
            onLocation={() => setModal("location")}
          />
        );
      }
      case "product_grid":
        return (
          <C.ProductGrid
            products={products}
            offers={offers}
            onSelect={selectProduct}
          />
        );
      case "category_explorer":
        return <D.CategoryExplorer categories={categories} />;
      case "store_map":
        return (
          <Suspense fallback={<P.LoadingCard />}>
            <StoreMap
              shops={
                !props.shopIds &&
                s.selectedProduct &&
                results.products.some((p) => p.id === s.selectedProduct)
                  ? shops.filter((sh) =>
                      Object.values(s.entities.offers).some(
                        (o) =>
                          o.productId === s.selectedProduct &&
                          o.shopId === sh.id,
                      ),
                    )
                  : shops
              }
              onSelect={(sh) => {
                set({ selectedShop: sh.id });
              }}
            />
          </Suspense>
        );
      case "offer_list":
        return (
          <C.OffersByProduct
            offers={offers}
            shops={currentShops}
            onShop={selectShop}
            onVisit={visit}
          />
        );
      case "product_detail":
        return products[0] ? (
          <C.ProductDetail product={products[0]} />
        ) : (
          <P.EmptyState />
        );
      case "store_detail":
        return shops[0] ? (
          <C.StoreDetailSheet shop={shops[0]} />
        ) : (
          <P.EmptyState />
        );
      case "product_comparison":
        return (
          <Q.ProductComparison
            products={props.productIds ? products : selectedProducts}
            offers={Object.values(s.entities.offers)}
          />
        );
      case "seller_comparison":
        return (
          <Q.SellerComparison
            offers={props.offerIds ? offers : sellerOffers}
            shops={currentShops}
            onVisit={visit}
          />
        );
      case "price_distance_plot":
        return (
          <Q.PriceVsDistancePlot
            offers={props.offerIds ? offers : currentOffers}
            shops={currentShops}
          />
        );
      case "decision_explanation":
        return <Q.DecisionExplanation />;
      case "dynamic_form":
        return <D.DynamicForm />;
      case "visit_summary":
        const visitOffer = props.offerIds ? offers[0] : selectedOffer;
        return (
          <C.VisitSummary
            key={visitOffer?.id}
            offer={visitOffer}
            shop={visitOffer ? s.entities.shops[visitOffer.shopId] : undefined}
            product={
              visitOffer ? s.entities.products[visitOffer.productId] : undefined
            }
          />
        );
      case "inquiry_draft":
        return (
          <C.StoreInquiryDraft
            product={
              props.offerIds && offers[0]
                ? s.entities.products[offers[0].productId]
                : currentProduct
            }
            offer={props.offerIds ? offers[0] : selectedOffer}
          />
        );
      case "saved_collection":
        return (
          <SavedCollection
            products={savedProducts}
            offers={Object.values(s.entities.offers)}
            onSelect={selectProduct}
          />
        );
      case "empty_results":
        return <C.EmptyResultsAndRelaxFilters />;
      case "source_disclosure":
        return <C.SourceDisclosure />;
      case "activity_timeline":
        return (
          <P.ToolActivityTimeline
            items={["درخواست دادهٔ واقعی", "نمایش نتایج ثبت‌شده"]}
          />
        );
      default:
        return <P.UnknownUIBlock />;
    }
  };
  const launch = async (id: string) => {
    setModal(null);
    if (id === "urgent") {
      const mission = createMission("شارژر");
      mission.category = "شارژر گوشی";
      mission.departure = mission.departure.slice(0, 11) + "23:30";
      set({
        mission,
        scene: "mission",
        location: { lat: 35.6953, lon: 51.4107, label: "جمهوری" },
      });
      setMobile("results");
      return;
    }
    if (id === "welcome") {
      set({ scene: "welcome" });
      return;
    }
    if (id === "categories") {
      set({ scene: "categories" });
      return;
    }
    if (id === "gallery") {
      set({ scene: "gallery" });
      return;
    }
    if (id === "history") {
      setModal("history");
      return;
    }
    if (id === "image") {
      setImageRequested((x) => x + 1);
      setMobile("chat");
      return;
    }
    if (id === "voice") {
      setMobile("chat");
      announce(
        "دکمهٔ میکروفن را بزنید؛ تبدیل صوت به قابلیت مرورگر وابسته است.",
      );
      return;
    }
    if (id === "offline") {
      setMode("remote");
      return;
    }
    if (id === "empty") {
      filter({ query: "کالای_بدون_نتیجه_آزمایشی", category: "" });
      return;
    }
    if (id === "nearby") {
      set({ location: { lat: 35.6953, lon: 51.4107, label: "جمهوری" } });
      filter({ ...initialFilters, nearby: true, radius: 1 });
      set({ scene: "map" });
      return;
    }
    if (id === "filters" || id === "vague") {
      setModal("filters");
      return;
    }
    try {
      const products = await api<Product[]>("scenarios");
      const p = products[0];
      if (!p) throw new Error("محصول چندفروشنده در دسترس نیست");
      const data = await api<Results>(
        "search?" + new URLSearchParams({ q: p.title, limit: "12" }),
      );
      remember(data.products, data.shops, data.offers);
      filter({ ...initialFilters, query: p.title });
      set({
        selectedProduct: p.id,
        location: { lat: 35.6953, lon: 51.4107, label: "جمهوری" },
      });
      if (id === "exact") {
        setProduct(p);
        return;
      }
      if (id === "products") {
        const second = await api<Results>(
          "search?" +
            new URLSearchParams({ category: p.category || "", limit: "3" }),
        );
        remember(second.products, second.shops, second.offers);
        set({
          compare: [
            p.id,
            ...second.products
              .filter((x) => x.id !== p.id)
              .slice(0, 1)
              .map((x) => x.id),
          ],
          scene: "compare",
        });
        setCompareTab("products");
        return;
      }
      if (id === "sellers") {
        set({ scene: "compare" });
        setCompareTab("sellers");
        return;
      }
      if (id === "decision") {
        set({ scene: "decision" });
        return;
      }
      if (id === "map") {
        set({ scene: "map" });
        return;
      }
      const offer = data.offers.find((o) => o.productId === p.id);
      if (offer) {
        visit(offer);
        if (id === "inquiry")
          announce(
            "پیش‌نویس استعلام در برنامهٔ مراجعه نمایش داده شد؛ ارسال نشده است.",
          );
      }
    } catch (e) {
      announce(e instanceof Error ? e.message : "خطای دریافت سناریو");
    }
  };
  const scene = s.scene;
  const displayScene = mobile === "map" ? "map" : scene;
  const go = (scene: Scene) => {
    set({ scene });
    setMobile(scene === "map" ? "map" : "results");
  };
  const sceneContent = () => {
    if (
      mode === "remote" &&
      remoteScene === displayScene &&
      !busy &&
      !error &&
      blocks.length
    )
      return <GenerativeCanvasRenderer blocks={blocks} />;
    if (displayScene === "welcome")
      return (
        <D.WelcomeSuggestions
          onSearch={send}
          onCategories={() => go("categories")}
          onLocation={() => setModal("location")}
          onImage={() => {
            setImageRequested((x) => x + 1);
            setMobile("chat");
          }}
          onUrgent={() => {
            set({ mission: s.mission || createMission(), scene: "mission" });
            setMobile("results");
          }}
        />
      );
    if (displayScene === "categories") return renderBlock("category_explorer");
    if (displayScene === "mission") return renderBlock("shopping_mission");
    if (displayScene === "results")
      return (
        <>
          {mode === "brain" && <AgentClarification onAction={(a,label) => { message('user',label); setLastAction(a); setMobile('results'); }} />}
          <D.SearchResultsHeader total={results.total} loading={busy} />
          {error ? (
            <div className="error-panel" role="alert">
              <p>{error}</p>
              <P.RetryAction retry={() => setRetry((x) => x + 1)} />
              {results.products.length > 0 && (
                <>
                  <p className="muted small">
                    آخرین داده‌های ذخیره‌شده؛ نتیجهٔ تازه دریافت نشده است.
                  </p>
                  <C.ProductGrid
                    products={results.products}
                    offers={results.offers}
                    onSelect={selectProduct}
                  />
                </>
              )}
              {mode === "remote" && (
                <P.Button onClick={() => setMode("demo")}>
                  بازگشت به حالت نمایشی
                </P.Button>
              )}
            </div>
          ) : busy ? (
            <div className="product-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <P.LoadingCard key={i} />
              ))}
            </div>
          ) : (
            <>
              <GenerativeCanvasRenderer blocks={blocks} />
              <div className="pagination">
                <P.Button
                  disabled={page === 0}
                  onClick={() => setPage((x) => Math.max(0, x - 1))}
                >
                  صفحهٔ قبل
                </P.Button>
                <span aria-live="polite">
                  صفحهٔ {fa(page + 1)} از{" "}
                  {fa(Math.max(1, Math.ceil(results.total / 12)))}
                </span>
                <P.Button
                  disabled={(page + 1) * 12 >= results.total}
                  onClick={() => setPage((x) => x + 1)}
                >
                  صفحهٔ بعد
                </P.Button>
              </div>
            </>
          )}
        </>
      );
    if (displayScene === "map")
      return (
        <>
          <div className="section-heading">
            <div>
              <h2>خرید در همین حوالی</h2>
              <p className="muted small">
                {fa(results.shops.length)} فروشگاه مرتبط با نتایج این صفحه
              </p>
            </div>
            <P.Button onClick={() => setModal("location")}>
              <MapPin size={16} />
              موقعیت من
            </P.Button>
          </div>
          {renderBlock("store_map")}
          {s.selectedShop && s.entities.shops[s.selectedShop] && (
            <div className="section">
              <C.StoreCard
                shop={s.entities.shops[s.selectedShop]}
                onSelect={() => selectShop(s.entities.shops[s.selectedShop!])}
              />
            </div>
          )}
        </>
      );
    if (displayScene === "compare" || displayScene === "decision")
      return (
        <ComparisonWorkspace
          products={
            selectedProducts.length
              ? selectedProducts
              : displayScene === "decision"
                ? results.products
                : []
          }
          offers={
            compareTab === "products"
              ? Object.values(s.entities.offers)
              : sellerOffers
          }
          shops={currentShops}
          mode={compareTab}
          onMode={setCompareTab}
          onVisit={visit}
          onLocation={() => setModal("location")}
        />
      );
    if (displayScene === "visit") return renderBlock("visit_summary");
    if (displayScene === "saved")
      return (
        <>
          <h2>برای بعد نگه داشتید</h2>
          {renderBlock("saved_collection")}
          <SavedShoppingPlan onVisit={visit} />
        </>
      );
    return (
      <ComponentGallery
        renderBlock={renderBlock}
        products={results.products}
        offers={results.offers}
      />
    );
  };
  return (
    <P.ErrorBoundary>
      <div
        className={`app-shell ${chatCollapsed ? "chat-collapsed" : ""} ${mobileChat && mobile !== "chat" ? "dock-open" : ""}`}
        style={{ "--chat-width": `${chatWidth}px` } as React.CSSProperties}
      >
        <header className="app-header">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              go("welcome");
            }}
          >
            <span className="brand-symbol hodhod-mark">
              <Sparkles size={29} />
            </span>
            <span className="brand-divider" />
            <span>
              <strong>هدهد</strong>
              <small>دستیار خرید حضوری</small>
            </span>
          </a>
          <div className="header-center">
            <P.ConnectionStatus
              remote={mode !== "demo"}
              connected={connected}
              label={mode === 'brain' ? backendStatus?.llmConfigured ? `هدهد · ${backendStatus.model}` : 'هدهد · موتور داده‌محور' : undefined}
              online={online}
            />
            <span className="header-location">
              <MapPin size={14} />
              {s.location?.label || "تهران، نزدیک شما"}
            </span>
          </div>
          <div className="header-actions">
            <P.IconButton
              label="شروع خرید تازه"
              onClick={() => {
                latest.cancel();
                useStore.getState().newSession();
                setMobile("results");
                setProduct(null);
                setShop(null);
              }}
            >
              <Plus size={20} />
            </P.IconButton>
            <P.IconButton label="تاریخچه" onClick={() => setModal("history")}>
              <History size={19} />
            </P.IconButton>
            <P.IconButton
              label="تغییر پوسته"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </P.IconButton>
            <P.IconButton label="راهنما" onClick={() => setModal("help")}>
              <HelpCircle size={19} />
            </P.IconButton>
          </div>
        </header>
        <div className="app-body">
          <div
            className={`chat-region ${mobile === "chat" ? "mobile-visible" : ""}`}
          >
            {mobileChat && mobile !== "chat" && (
              <div className="mobile-chat-heading">
                <strong>
                  <Sparkles size={15} />
                  گفت‌وگو با هدهد
                </strong>
                <P.IconButton
                  label="بستن چت کنار خرید"
                  onClick={() => setMobileChat(false)}
                >
                  <X size={17} />
                </P.IconButton>
              </div>
            )}
            <ChatPanel
              remote={mode !== "demo"}
              onSend={send}
              onAction={action}
              busy={busy}
              progress={progress}
              onCancel={() => {
                latest.cancel();
                setBusy(false);
                setProgress("درخواست لغو شد");
                announce("درخواست لغو شد.");
              }}
              onHistory={() => setModal("history")}
              imageRequested={imageRequested}
            />
          </div>
          <div
            className="resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="تغییر عرض گفت‌وگو"
            aria-valuenow={chatWidth}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft")
                setChatWidth((v) => Math.min(500, v + 20));
              if (e.key === "ArrowRight")
                setChatWidth((v) => Math.max(290, v - 20));
            }}
            onPointerDown={(e) => {
              const start = e.clientX,
                initial = chatWidth;
              e.currentTarget.setPointerCapture(e.pointerId);
              const move = (ev: PointerEvent) =>
                setChatWidth(
                  Math.max(290, Math.min(500, initial + start - ev.clientX)),
                );
              const end = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", end);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", end);
            }}
          />
          <main
            className={`workspace ${mobile !== "chat" ? "mobile-visible" : ""}`}
            id="main"
          >
            <div className="workspace-toolbar">
              <div className="workspace-breadcrumb">
                <button onClick={() => go("welcome")}>
                  <LayoutGrid size={16} />
                  فضای خرید من
                </button>
                <ChevronLeft size={14} />
                <span>{s.title}</span>
              </div>
              <div>
                <P.IconButton
                  label="جمع‌کردن یا بازکردن چت"
                  onClick={() => setChatCollapsed(!chatCollapsed)}
                >
                  <MessageCircle size={17} />
                </P.IconButton>
                <P.Button variant="ghost" onClick={() => setModal("scenarios")}>
                  <FlaskConical size={16} />
                  سناریوهای نمایشی
                </P.Button>
              </div>
            </div>
            {scene !== "welcome" && displayScene !== "mission" && (
              <div className="intent-bar">
                <D.FilterChips onLocation={() => setModal("location")} />
                <P.Button onClick={() => setModal("filters")}>
                  <SlidersHorizontal size={15} />
                  فیلترها
                </P.Button>
              </div>
            )}
            <nav className="workspace-tabs" aria-label="نمای فضای خرید">
              {(
                [
                  { id: "results", label: "نتایج", icon: LayoutGrid },
                  { id: "mission", label: "خرید فوری", icon: Sparkles },
                  { id: "categories", label: "دسته‌بندی‌ها", icon: Compass },
                  { id: "map", label: "نقشه", icon: MapPin },
                  { id: "compare", label: "مقایسه", icon: GitCompareArrows },
                  { id: "saved", label: "ذخیره‌ها", icon: Bookmark },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  className={
                    displayScene === t.id ||
                    (t.id === "compare" && displayScene === "decision")
                      ? "active"
                      : ""
                  }
                  onClick={() => go(t.id)}
                >
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="inline-chat-control">
              <P.Button
                aria-pressed={mobileChat}
                onClick={() => setMobileChat(!mobileChat)}
              >
                <MessageCircle size={16} />
                {mobileChat ? "بستن چت در همین صفحه" : "چت در همین صفحه"}
              </P.Button>
            </div>
            <div
              className={`canvas ${s.compare.length ? "has-compare-tray" : ""}`}
            >
              <RegistryContext.Provider value={{ render: renderBlock }}>
                {!online && <P.OfflineFallback />}
                {persistenceError && (
                  <P.PartialDataState>{persistenceError}</P.PartialDataState>
                )}
                {sceneContent()}
              </RegistryContext.Provider>
            </div>
            <Q.CompareTray
              onCompare={() => {
                setCompareTab("products");
                go("compare");
              }}
            />
          </main>
        </div>
        <nav className="mobile-nav" aria-label="ناوبری موبایل">
          {(
            [
              { id: "chat", label: "گفت‌وگو", icon: MessageCircle },
              { id: "results", label: "خرید", icon: LayoutGrid },
              { id: "map", label: "نقشه", icon: MapPin },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              aria-current={mobile === t.id ? "page" : undefined}
              className={mobile === t.id ? "active" : ""}
              onClick={() => setMobile(t.id)}
            >
              <t.icon size={21} />
              {t.label}
            </button>
          ))}
        </nav>
        {modal === "history" && (
          <ConversationHistory
            onClose={() => setModal(null)}
            onAction={action}
          />
        )}
        {modal === "location" && (
          <P.Dialog title="از کجا خرید می‌کنید؟" onClose={() => setModal(null)}>
            <D.LocationPicker onDone={() => setModal(null)} />
          </P.Dialog>
        )}
        {modal === "filters" && (
          <P.Dialog title="شرایط خرید شما" onClose={() => setModal(null)}>
            <D.DynamicForm onDone={() => setModal(null)} />
          </P.Dialog>
        )}
        {modal === "help" && (
          <P.Dialog
            title="هدهد، دستیار خرید حضوری"
            onClose={() => setModal(null)}
          >
            <p>
              گفت‌وگو به بک‌اند هدهد متصل است. نتیجه‌ها، پیشنهادهای فروشندگان و نقشه از کاتالوگ واقعی می‌آیند. نمونه‌های آزمایشی نیز از بخش سناریوها در دسترس‌اند.
            </p>
            <C.SourceDisclosure />
            <h3>اتصال دستیار</h3>
            <label className="field">
              حالت اجرا
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "demo" | "remote" | "brain");
                  localStorage.setItem('hodhod-engine', e.target.value);
                  setRetry((x) => x + 1);
                }}
              >
                <option value="demo">نمایشی · دادهٔ واقعی</option>
                <option value="brain">هدهد · بک‌اند اصلی</option>
                <option value="remote">
                  سرویس دستیار · نیازمند تنظیم نشانی
                </option>
              </select>
            </label>
            <P.Button
              onClick={() => {
                setModal(null);
                go("gallery");
              }}
            >
              گالری کامپوننت‌ها
            </P.Button>
          </P.Dialog>
        )}
        {modal === "scenarios" && (
          <P.Dialog
            title="با یک سناریو، تجربه کنید"
            wide
            onClose={() => setModal(null)}
          >
            <p className="muted">
              بدون LLM · سناریوها از رکوردهای واقعی داده انتخاب می‌شوند.
            </p>
            <div className="scenario-grid">
              {scenarios.map((v, i) => (
                <button key={v.id} onClick={() => launch(v.id)}>
                  <span>{fa(i + 1)}</span>
                  <strong>{v.label}</strong>
                  <ChevronLeft size={16} />
                </button>
              ))}
            </div>
          </P.Dialog>
        )}
        {product && (
          <P.Dialog
            title="بررسی کالا و فروشندگان"
            wide
            onClose={() => setProduct(null)}
          >
            <C.ProductDetail product={product}>
              <div className="detail-actions">
                <P.Button
                  onClick={() => {
                    useStore.getState().toggleCompare(product.id);
                    announce("سبد مقایسه به‌روزرسانی شد.");
                  }}
                >
                  <GitCompareArrows size={16} />
                  مقایسهٔ کالا
                </P.Button>
                <P.Button
                  onClick={() => {
                    setCompareTab("sellers");
                    set({ scene: "compare" });
                    setProduct(null);
                  }}
                >
                  مقایسهٔ فروشندگان
                </P.Button>
                <P.Button
                  onClick={() => {
                    setProduct(null);
                    go("map");
                  }}
                >
                  نمایش روی نقشه
                </P.Button>
              </div>
              <C.OffersByProduct
                offers={Object.values(s.entities.offers).filter(
                  (o) => o.productId === product.id,
                )}
                shops={currentShops}
                onShop={(sh) => {
                  setProduct(null);
                  selectShop(sh);
                }}
                onVisit={visit}
              />
              <SimilarProducts product={product} onSelect={selectProduct} />
            </C.ProductDetail>
          </P.Dialog>
        )}
        {shop && (
          <P.Dialog title="اطلاعات فروشگاه" onClose={() => setShop(null)}>
            <C.StoreDetailSheet shop={shop}>
              <StoreOffers
                shop={shop}
                onSelect={(p) => {
                  setShop(null);
                  selectProduct(p);
                }}
              />
            </C.StoreDetailSheet>
          </P.Dialog>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
            <P.IconButton label="بستن اعلان" onClick={() => setToast("")}>
              <X size={15} />
            </P.IconButton>
          </div>
        )}
      </div>
    </P.ErrorBoundary>
  );
}
export function ResponsiveWorkspace() {
  return <AppShell />;
}
export function SavedCollection({
  products,
  offers,
  onSelect,
}: {
  products: Product[];
  offers: Offer[];
  onSelect: (p: Product) => void;
}) {
  return products.length ? (
    <C.ProductGrid products={products} offers={offers} onSelect={onSelect} />
  ) : (
    <P.EmptyState
      title="انتخاب‌های خوب را نگه دارید"
      description="با نشان ذخیره روی کارت کالا، آن را اینجا نگه دارید."
    />
  );
}
export function SavedShoppingPlan({
  onVisit,
}: {
  onVisit: (o: Offer) => void;
}) {
  const s = useStore((x) => x.session);
  return (
    <section className="section">
      <h3>برنامه‌های مراجعه</h3>
      {s.plans.length ? (
        s.plans.map((p) => {
          const o = s.entities.offers[p.offerId];
          return o ? (
            <P.Button key={p.id} onClick={() => onVisit(o)}>
              {s.entities.products[o.productId]?.title || o.title} ·{" "}
              {fa(p.checks.length)} مورد بررسی‌شده
            </P.Button>
          ) : null;
        })
      ) : (
        <p className="muted">هنوز برنامه‌ای ذخیره نشده است.</p>
      )}
    </section>
  );
}
export function StoreOffers({
  shop,
  onSelect,
}: {
  shop: Shop;
  onSelect: (p: Product) => void;
}) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    api<Results>(
      "search?" + new URLSearchParams({ shop: shop.id, limit: "6" }),
      c.signal,
    )
      .then((d) => {
        setData(d);
        useStore.getState().remember(d.products, d.shops, d.offers);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => c.abort();
  }, [shop.id]);
  return (
    <section className="section">
      <h3>کالاهای ثبت‌شدهٔ فروشگاه</h3>
      {error ? (
        <P.DataUnavailable />
      ) : data ? (
        <C.ProductGrid
          products={data.products}
          offers={data.offers}
          onSelect={onSelect}
        />
      ) : (
        <P.LoadingCard />
      )}
    </section>
  );
}
export function SimilarProducts({
  product,
  onSelect,
}: {
  product: Product;
  onSelect: (p: Product) => void;
}) {
  const [data, setData] = useState<Results | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api<Results>(
      "search?" +
        new URLSearchParams({ category: product.category || "", limit: "4" }),
      c.signal,
    )
      .then((d) => {
        setData(d);
        useStore.getState().remember(d.products, d.shops, d.offers);
      })
      .catch(() => {});
    return () => c.abort();
  }, [product.id]);
  return data ? (
    <section className="section">
      <h3>کالاهای هم‌دسته</h3>
      <p className="muted small">هم‌دسته بودن به معنی هم‌ارزی مشخصات نیست.</p>
      <C.ProductGrid
        products={data.products.filter((x) => x.id !== product.id)}
        offers={data.offers}
        onSelect={onSelect}
      />
    </section>
  ) : null;
}
function ComponentGallery({
  renderBlock,
  products,
  offers,
}: {
  renderBlock: (type: string, props?: UIBlock["props"]) => React.ReactNode;
  products: Product[];
  offers: Offer[];
}) {
  return (
    <section className="gallery">
      <P.Badge tone="accent">گالری تعاملی</P.Badge>
      <h2>اجزای یک تجربهٔ خرید</h2>
      <p className="muted">
        کامپوننت‌ها با دادهٔ واقعی و حالت‌های ناقص، خالی و خطا.
      </p>
      <div className="gallery-states">
        <C.AvailabilityUnverifiedNotice />
        <P.LoadingCard />
      </div>
      {Object.entries(UIComponentRegistry).map(([type, v]) => (
        <details key={type} className="gallery-section">
          <summary>
            <strong>{v.name}</strong>
            <P.Badge>{v.family}</P.Badge>
          </summary>
          {renderBlock(type)}
        </details>
      ))}
      <details className="gallery-section">
        <summary>حالت‌های سیستم و مجوزها</summary>
        <P.EmptyState />
        <P.PermissionDenied />
        <P.OfflineFallback />
        <P.NoRouteFound />
        <P.DataUnavailable />
        <P.PartialDataState />
        <P.UnknownUIBlock />
      </details>
    </section>
  );
}
