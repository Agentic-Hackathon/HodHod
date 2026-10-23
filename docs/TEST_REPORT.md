# Verification report

**Backend integration revision:** [BACKEND_CONNECTION.md](BACKEND_CONNECTION.md) documents the default Django connection, OpenAI-compatible `gpt-5-mini` setup, and integration tests. The initial frontend-only release record below is historical.

**Latest UX revision:** see [UX_UPDATE.md](UX_UPDATE.md) for the current 58-test result, real two-mode routing verification and updated screenshots. The report below records the initial release; in particular its original unconfigured-routing limitation has been superseded by the verified routing gateway.

Verified on the user's Windows workspace `the repository root`, client date **2026-10-23**. Fresh repository inspection found only the original README.txt and three CSVs; no existing app, package files, Git checkout or applicable AGENTS.md was present. The master prompt was read in full. Original CSV/README sizes and modification times remain unchanged after import, app development and tests.

## Final results

| Check                                                             | Result                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                                      | PASS: strict TypeScript build + Vite production bundle, 1,622 transformed modules                        |
| `pnpm lint`                                                       | PASS: `tsc --noEmit` (this project uses strict TypeScript validation, not an ESLint claim)               |
| `pnpm test`                                                       | PASS: **21** Vitest unit/component tests in 3 files                                                      |
| `python scripts/test_data.py`                                     | PASS: **9** complete-corpus SQLite integration tests                                                     |
| `TOROB_PRODUCTION_URL=http://127.0.0.1:5174 pnpm test:e2e`        | PASS: **11** real-browser Playwright tests, no skipped tests in the final run, 16.9 s                    |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1` | PASS: unchanged import skipped; hidden local API + Vite started at 8787/5173                             |
| axe WCAG 2 A/AA checks                                            | PASS on checked default light and mobile dark views; zero violations in those scans                      |
| Original data integrity                                           | 225,903 products, 331,506 offers, 6,476 shops; zero orphan offers; zero illegal/missing coordinate pairs |

**41 automated tests passed in total** (21 + 9 + 11). Browser tests use installed Microsoft Edge/Chromium headless. The actual bundled Node and Python runtimes were used, because normal Node/npm were not on PATH. `start.ps1` discovers these paths automatically; ordinary Node/Python/pnpm installations work outside this environment.

## Reproduce here

Run `./start.ps1` in one PowerShell terminal. For conventional shells with runtimes on PATH:

```powershell
pnpm install
python scripts/data_service.py --import-only
python scripts/data_service.py  # keep running in terminal 1
pnpm dev                       # terminal 2
pnpm build
pnpm lint
pnpm test
python scripts/test_data.py
pnpm preview --port 5174        # terminal 3, production build already complete
$env:TOROB_PRODUCTION_URL='http://127.0.0.1:5174'
pnpm test:e2e
```

Without TOROB_PRODUCTION_URL, only the explicit production-offline test is skipped; the remaining ten browser tests do not require a preview server. Playwright's executable path can be configured with PLAYWRIGHT_BROWSER_PATH.

Exact runtime paths used in this session:

- Node: `C:\Users\IUT\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- Python: `C:\Users\IUT\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
- pnpm: `C:\Users\IUT\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`

## Covered behaviors

- Versioned schema, explicit inventory=false, blocked HTML/factual-prop injection, unknown-block fallback with diagnostic logging.
- Remote request/envelope correlation, latest-request abort/stale protection, concurrent-request deduplication and chunked SSE progress/final response parsing.
- Haversine zero/known/antipodal distances; safe outbound URL schemes; missing price stays unknown; image MIME/size rejection.
- Routing unavailable, mode mismatch (no car route for walking), metric-unit preservation, malformed geometry/metrics and network failure.
- Source row counts, read-only DB enforcement, real product joins/multiple offers, Unicode normalization, pagination/bounds, consistent price/geo/payment/warranty filtering and no-result queries.
- Desktop exact-product → sellers → compare → refresh restores canvas → visit plan → saved status.
- Real category selection; budget, radius, provider and recorded warranty controls/chips.
- Product comparison and seller comparison as separate views; price-distance decision chart and inquiry explicitly marked not sent.
- Map/list selection and pan/bounds action with intentionally blocked tile/glyph requests; map remains usable as a list.
- Denied geolocation and manual selection; Escape dismisses dialogs; unsupported voice fallback; editable successful recognition via a **test-only browser API stub**, not a claim of live STT testing.
- Valid image attachment/preview/removal with honest disconnected vision status.
- Missing remote endpoint, Demo recovery, gallery system variants, offline API failure with historical results, rename and delete cancellation.
- Production service worker precaches only application assets. Full network-offline refresh renders the app and restores the saved session, without fake live data or cached remote media.

## Responsive / visual QA

Checked **320, 375, 390, 768, 1024 and 1440 px** widths at 900 px height; 390×844 flow screenshots; 844×390 landscape dark. No document-level horizontal overflow in checked layouts. Desktop chat appears on the right and canvas on the left. Mobile panes switch via bottom navigation and use shared state. Screenshots were rendered with reduced motion for stable inspection.

Representative screenshots:

- [Desktop welcome](screenshots/desktop-welcome.png)
- [Mobile welcome](screenshots/welcome-390.png)
- [Mobile results](screenshots/mobile-results.png)
- [Real product/offers](screenshots/product-offers.png)
- [Dark desktop](screenshots/desktop-dark.png)
- [Map tile outage](screenshots/map-offline.png)
- [Production offline reload](screenshots/production-offline.png)
- [Landscape dark](screenshots/landscape-dark.png)

Visual inspection confirmed layout, RTL, disclosure and fallback behavior. Product photos may still be loading when fast screenshots are captured; remote images are neither bundled nor represented as locally verified assets. The image placeholder appears on load failure.

## Measured local data performance

Latest full import: **15.02 s** (first import 14.83 s). SQLite index: **639,893,504 bytes** on disk, outside the frontend build. `docs/PERFORMANCE.json` records measured warm-query timings:

| Query                        |     Time | Total matching products | Products sent | JSON payload |
| ---------------------------- | -------: | ----------------------: | ------------: | -----------: |
| Default page                 | 0.0592 s |                 225,903 |            12 |     74,447 B |
| 1 km straight-line radius    | 1.1371 s |                  97,412 |            12 |     92,897 B |
| Registered in-person payment | 1.2854 s |                   4,563 |            12 |     59,992 B |

These are local samples, not a production SLA. The importer never reads the full source into browser memory. Product search uses SQLite FTS5 and joins/indexes; result count may dominate complex geo/payment queries. Main JS is about 479 kB uncompressed / 144 kB gzip; MapLibre is lazy-loaded separately (~1.06 MB / 288 kB gzip). Font files are local assets.

## Explicit integration / verification limits

- No teammate LLM endpoint was supplied. Remote protocol correctness is tested with injectable transports; a real backend connection, its retrieval quality, assistant-text streaming and incremental canvas patches remain integration work. SSE progress and final render are implemented.
- No OSRM service is configured. Live route-engine and ETA accuracy were not verified. The default shows no ETA and provides user-initiated external navigation. Routing adapter behavior is unit tested.
- Map online tile availability and remote image hosting are external. Tests deliberately verify outage handling; they do not claim production tile capacity or guaranteed live map availability. Default public OSM tiles are only for local low-volume demonstration and require a suitable provider for production.
- No vision or file-audio recognition backend is connected. Browser speech recognition depends on browser/OS permissions and service support; live Persian speech accuracy was not measured.
- No physical phone/tablet or real virtual keyboard was available. Responsive browser emulation, permission stubs, keyboard focus checks and automated axe checks do not establish full WCAG certification or physical-device compatibility.
- Dataset coverage remains sampled/snapshot-only. All phones are synthetic; no messages or calls were sent. No live inventory, current price guarantee, store rating, actual reservation or payment flow is implemented or claimed.
- Missing CSVs produce an explicit import/data-unavailable error; no synthetic fixture corpus is substituted. Optional multi-store itinerary is deferred. Local screenshot/history artifacts and source are delivered; no cloud hosting was requested or performed.

Earlier failures (gallery hydration timing, muted-color contrast and same-origin Vary headers in offline asset matching) were repaired before the successful final runs. Initial npm sandbox network denial was resolved by authorized dependency installation; no approval blocker remains.
