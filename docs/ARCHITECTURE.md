# Architecture

## Boundaries

The frontend owns presentation, interactions, a canonical shopping session and local persistence. `BackendAgentAdapter` connects it to the supplied Django agent through a same-origin workspace bridge. The backend supports OpenAI-compatible tool calling and grounded catalogue chat without a key. `DemoAgentAdapter` retains repeatable catalogue scenarios; `RemoteAgentAdapter` remains the generic HTTP/SSE boundary. No autonomous seller contact or live-inventory verification is implemented. See [BACKEND_CONNECTION.md](BACKEND_CONNECTION.md).

```
User action -> canonical Zustand session -> UI action event
            -> AgentAdapter.dispatch(v1 request, AbortSignal)
            -> Zod envelope validation + session/request correlation
            -> trusted data API resolves entity IDs
            -> normalized entity cache + result snapshot
            -> allowlisted generative renderer -> domain components
```

`src/app/App.tsx` composes the shell, user-visible scenes and integration lifecycle. Commerce, discovery, comparison and state widgets are reusable modules; no scenario-specific duplicate JSX pages exist. `/showcase` selects actual data records and navigates the same components. `/gallery` renders the registry with real records and state variants. Remote scenes use their selected blocks; explicit navigation still exposes local views.

## Data service

`scripts/data_service.py`: Python standard library only; streaming UTF-8 CSV -> batched SQLite import -> indexes on joins/category/price/geo -> FTS5 product search -> paginated JSON endpoints. A temporary DB is replaced only on a completed import. Original CSVs are opened read-only and never rewritten. The serving connection uses SQLite `mode=ro`; HTTP listens on loopback and implements GET only. No all-CSV browser parsing or corpus embedding in the JS bundle. Startup compares filenames/sizes/mtimes and skips unchanged imports. Use `--force` after changing normalization code.

Data endpoint errors are recoverable. Missing CSVs explicitly block import with an actionable message; because the full corpus is present, no synthetic fallback fixtures are shipped. `DATA_INSPECTION.json` records raw schema, row counts, nulls, privacy-safe samples and joins.

## State and persistence

Zustand `ShoppingSession` includes stable IDs, messages, intent/filters, chosen location, selections, comparison, saved products/plans, scene, priority, map viewport, normalized entity snapshots and last result IDs/blocks. IndexedDB/Dexie v2 persists sessions, including migrations from v1 and recovery UI on storage failure. LocalStorage stores only active session ID and theme. Writes are debounced 200 ms. Large CSVs and voice/image blobs are not stored. Location is acquired only on user interaction; explicitly selected locations are retained with that session, without continuous tracking.

Transient modal, hover, open detail, composer attachment, streaming progress, loading/error, resizer and mobile navigation state stay outside durable state. Historical results carry timestamps and remain visible with a stale-data notice after API failure. The production service worker pre-caches only same-origin application assets, never API data, map tiles or remote product images; cached sessions supply historical facts offline. The development server intentionally does not register a service worker.

Starting a new session preserves prior saved sessions. Delete/clear require an in-app confirmation. Compare/save/selection state survives filter changes. Last-result requests use abort/version/session guards so older responses cannot replace a newer workspace. Correlation IDs and strict schemas protect the remote transport. Automatic retries are deliberately absent; explicit retry is user controlled.

## Responsive layout

Desktop flex order in RTL puts persistent chat on the right and canvas left. Chat width is pointer/keyboard adjustable (290–500 px); tablet can collapse it. Under 768 px, bottom navigation switches Chat/Shopping/Map with preserved state; an optional inline chat dock keeps the conversation available beneath shopping and comparison. Details/forms/history use bottom-sheet styling on mobile, a focus-trapped dialog on larger displays, Escape dismissal and focus restoration. The canvas has independent scroll; tables scroll inside their container. Safe-area and `100dvh` prevent keyboard/viewport clipping where supported.

Design tokens cover light/dark surfaces, semantic contrast, spacing/radii and restrained motion. Font files are bundled Vazirmatn. Labels and status text are Persian; entity titles use automatic bidi direction, underlying values remain numeric. Map and external URLs use geographic order explicitly; direct distance is Haversine and never an ETA.

## External adapters

- MapLibre: configurable style/tiles, real shop coordinates, cluster layers, user/selection layers, list synchronization, manual pin and user-driven bounds filtering. A tile outage keeps the list usable. The public OSM default is for low-volume local use only.
- Routing: `travel.ts` -> read-only `/api/route` gateway in `scripts/routing_service.py` -> separate car/foot OSRM endpoints. Default free FOSSGIS engines, configurable self-hosted alternatives, global rate limit and bounded in-memory cache. Both modes are calculated for a selected visit, with map geometry, directions and arrival-time schedule checks. Seller comparison triggers route requests on user interaction. The standalone RoutingProvider/OSRMProvider interfaces remain available for other integrations. Missing routing never produces an invented ETA.
- SpeechToTextProvider: browser capability/permissions, editable recognition result, no fabricated transcripts. Audio file adapter is disconnected until implemented.
- ImageUnderstandingAdapter: validated photo attachment/preview and explicit unconnected recognition status.

## Free dependencies

React/TypeScript/Vite supply the application; Zustand supplies a compact shared store; Dexie gives structured local history and migrations; Zod validates the transport; MapLibre supplies interactive mapping; Lucide and Vazirmatn supply local icon/font assets. Vitest/Testing Library, Playwright/axe and Prettier are development-only. No hosted commercial framework or usage-based SDK is required.
