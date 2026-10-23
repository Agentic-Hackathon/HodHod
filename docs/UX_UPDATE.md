# هدهد — UX revision and verification

This revision implements the user's screenshot feedback on the actual application. No CSV was rewritten and no product/photo/price fixtures were substituted in the app. `DemoAgentAdapter` remains a deterministic local adapter; the visible identity is now **هدهد** and the normal status is local search, not an implied connected LLM. Broad source banners and the old branded demo footer were removed; actionable price age/availability uncertainty remains attached to factual offers and the visit receipt.

## Implemented

- **Visual filters:** actual-query price-distribution histogram, quantile-based economic/median/flexible budget presets, two accessible range controls and optional formatted Persian exact entry. There are no fabricated suggested price bands; presets wait for real distribution data. Radius is selected with touch-friendly 500 m / 1 / 2 / 5 / 10 / 30 km chips and a radial visual. Changes are drafted and applied together, with validation for min > max.
- **Decision helper:** actual non-dominated Pareto frontier (minimize recorded price and direct distance), numbered and keyboard-selectable points, persistent product/shop/price/distance inspector, matching legend, selected candidate and purchase-plan action. A clearly labeled logarithmic/linear switch makes outliers less likely to compress all other options. Changing chart scale does not change actual values or the frontier.
- **Product comparison:** actual source specs across all sections, consistent normalized feature keys, color swatches from source color values, recorded-price bars, seller counts, a lowest-price highlight limited to the selected comparison, and a differences-only toggle. No arbitrary specification winner or synthetic rating is inferred. Inspiration from the user's [Artificial Analysis comparison reference](https://artificialanalysis.ai/models/comparisons/gpt-6-1-sol-medium-vs-gpt-5-6-terra-xhigh): shared columns and grouped metrics; no model benchmark content was copied into product facts.
- **Seller comparison:** one product must be chosen before sellers are compared. Offers group by **productId + shopId** and preserve independent offer IDs, source titles, prices, timestamps and warranties in an expandable section. Distinct products are never silently presented as price alternatives for one identical item. Cards include address/payment/warranty and both walking/driving duration and route distance after calculation.
- **Mobile inline chat:** “چت در همین صفحه” opens a resizable-to-viewport conversation area beneath shopping/map/compare content. It uses the same ChatPanel/composer and canonical session as the full chat tab, preserving inputs/media/voice behavior. It does not create a second disconnected conversation.
- **Pagination:** page X **of total pages**, based on actual result count and 12-item pages.
- **Visit plan:** source product image/specs, quantity, unit price and computed recorded total, merchant details and weekly schedule, both real route modes, map geometry, turn guidance, departure time in Tehran, ETA-dependent opening status and next recorded opening. Quantity/departure/checklist are persisted in saved plans. Unknown hours remain unknown; zero-length placeholder shifts do not become 24-hour opening. Final payable price is not fabricated from a stale snapshot.

## Duplicate-shop investigation

Exact source shop: **وییس رامنوش**, `shop_dfa25fc93470a47ba753e216`. We inspected both the SQLite index and original offers.csv. There are 168 raw offer rows for this shop, 39 in the shown lighting category. All 12 inspected first-product offers matched their raw CSV IDs, product IDs and prices.

The screenshot's apparent duplicates include **different products**:

| Recorded price (toman) | Product                                                  | Product ID                       |
| ---------------------: | -------------------------------------------------------- | -------------------------------- |
|                262,570 | چراغ سقفی مودی مدل IR-MD4607 ظرفیت ۷ وات آفتابی و مهتابی | product_32a547f3723a22c4158a2431 |
|                948,640 | چراغ سقفی سنسور دار مودی ۲۲ وات گرد                      | product_df39fe4d9b5f4c67e38613fd |
|              1,046,650 | براکت 40 وات 60 سانتی ویمکس IR-V3440-K                   | product_97b60417ffd37ce2d2c86ca4 |

The frontend problem was **omitted product identity and comparison scope**, not price generation or an accidental SQL join multiplication. Previously the decision fallback sent every offer from the page into seller-style cards when no exact product was selected, with only a shop name visible. The new decision cards identify both product and shop; seller comparisons require a single product. Historical cached offers from an unrelated earlier intent also no longer set the current decision scope.

Separately, the raw dataset contains five product/shop groups with multiple independent offer IDs (four groups of two, one of three). They are preserved, grouped and expandable rather than silently deleting records. See [DUPLICATE_INVESTIGATION.json](DUPLICATE_INVESTIGATION.json); rerun `python scripts/investigate_offers.py` to verify against original CSV.

## Actual routing, not a direct-distance estimate

The backend gateway uses separate **routed-car** and **routed-foot** prepared engines from [FOSSGIS/OpenStreetMap](https://routing.openstreetmap.de/about.html), at most one external request per 1.1 seconds across modes. Successful routes cache for 15 minutes; transient failures have short expiry. Configure `TOROB_ROUTING_CAR_URL` and `TOROB_ROUTING_FOOT_URL` for self-hosted production services. Routes are calculated against trusted dataset shop coordinates. No traffic feed or ETA is fabricated during an outage. The provider receives the selected endpoints; source/privacy/attribution and “fix the map” links are available in the route view.

**Real integration check**, sample origin 35.6953, 51.4107 (Jomhouri neighborhood, not a captured user's location) to the actual shop above:

| Mode | Street-route distance |   Router duration | Geometry / instructions |
| ---- | --------------------: | ----------------: | ----------------------- |
| Car  |             1,793.6 m |  176.9 s (~3 min) | 37 points, 7 steps      |
| Foot |             1,146.7 m | 919.5 s (~15 min) | 22 points, 7 steps      |

The complete real responses are in [LIVE_ROUTE_VERIFICATION.json](LIVE_ROUTE_VERIFICATION.json). `python scripts/verify_live_routes.py` calls the running local API; set TOROB_API_PORT if using an alternate port. `scripts/capture-live-visit.mjs` captured the **real** responses in [hodhod-live-route.png](screenshots/hodhod-live-route.png). Background map tiles require internet and can be unavailable independently of the computed route geometry, which remains displayed.

## Tests

- `pnpm build`: passed (TypeScript + Vite, 1,628 transformed modules).
- `pnpm lint`: passed (strict TypeScript validation).
- `pnpm test`: **28** passing unit/component/contract tests, including actual Pareto dominance, grouped-offer identity, Persian amounts, Tehran timezone/overnight/opening-boundary logic.
- `python scripts/test_data.py`: **10** passing full-corpus data tests, including real category-scoped price quantiles/histogram.
- `python scripts/test_routing.py`: **4** passing gateway tests for separate mode engines, successful caching, missing network and input rejection.
- Playwright with both dev and production servers: **16** passing real-browser tests, including mobile inline chat, interactive chart identity, comparison scope, visual filter controls, visit quantity/arrival, original flows, offline production refresh, responsive widths and axe checks.

**58 tests passed**. Automated UI tests deliberately mock `/api/route` to avoid repeatedly hitting the community routing server; the independent live check above is not mocked. The “hodhod-visit.png” automated screenshot uses test-only route responses; “hodhod-live-route.png” is the real integration screenshot. Browser widths: 320 / 375 / 390 / 768 / 1024 / 1440, plus landscape. No document overflow in checked layouts. Physical phone/keyboard testing and live traffic accuracy are not claimed.

For isolated QA alongside an already-running user app, this session used API **8788**, Vite **5176**, production preview **5177**, with `TOROB_API_PORT`, `TOROB_TEST_URL`, `TOROB_PRODUCTION_URL`. The default user launch remains 8787/5173. Original user-owned processes were not stopped to take over their ports.

## Restart in Git Bash

The Python backend has new endpoints, so a browser refresh alone is insufficient. Stop the original application terminal with **Ctrl+C**, then:

```bash
cd /e/Torob
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./start.ps1
```

The localhost default remains [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Product data, photos, specs and prices come from the provided CSV corpus. Most shop names and all phone numbers were synthesized by the organizer; no replacement product/photo/price data were generated by this application. LLM, vision and file-audio recognition are still external integration boundaries, as requested in the original architecture.
