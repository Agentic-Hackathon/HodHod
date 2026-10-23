# UX flows

## Discovery

Welcome → choose a starter, enter a product term or open real categories → select a category → canonical filter updates → paginated cards. Categories are flat because the dataset supplies no hierarchy. Budget, radius, payment provider/channel and recorded warranty filters are direct controls; every applied condition is removable as a chip. Unknown-price offers do not match numeric price bounds.

## Exact product

Keyword/model search → card → product detail with images/specs → real joined offers → compare sellers, inspect a store, view its registered products or plan a visit. Seller-specific prices/warranty remain tied to offers. Prices always show تومان and price-change timestamps; no amount or live-stock assertion comes from model text. Similar products are labeled same-category, not equivalent specifications.

## Nearby

User explicitly opens location picker → browser permission **or** neighborhood/coordinate entry → optional 1 km **straight-line radius** → list/map from the same constrained offers. A manual pin on the map updates the canonical location. Drag/zoom → explicit bounds-search button → new dataset query. Card ↔ marker selection shares selectedShop. Invalid locations are excluded from map; missing coordinates do not hide basic product facts. Outside covered neighborhoods, no results are explained as limited dataset coverage.

## Comparison and decision

Add up to four product IDs to compare → product matrix with absent fields stated explicitly. Select one product → seller comparison with recorded price/age, direct distance and unverified inventory. Decision view plots price vs direct distance with an accessible textual legend. Priority price/distance/balance changes the deterministic ordering. Balance uses equally weighted normalized price and distance, stated in the UI; unknown values receive a disclosed penalty. No ratings or trust scores are invented.

## Visit and follow-up

Choose one actual offer → visit summary → recorded address (including mall/floor/unit text), schedule, price age, unknown inventory → checklist and saved plan → explicit external navigation. Optional configured routing shows mode-specific geometry, metric distance and ETA without live traffic. Unavailable/unsupported routing gives direct distance and no fabricated ETA. Inquiry generates a **demo/not sent** draft; user may copy it. All synthetic phone numbers are withheld.

## No results / failure

No matches → explain bounded coverage → explicit "remove filters and search again" action; constraints remain until that click. API failure → retry or preserve historical snapshot with stale label. Remote endpoint unavailable → distinguish disconnected status and allow Demo recovery. Unknown block → supported-version notice; invalid envelope → recoverable integration error. Tile failure → list navigation remains. Denied location → manual picker; denied/unsupported microphone → text entry/audio adapter fallback; attached photo → preview plus honest disconnected vision status.

## Persistence

Session tracks chat **and** filters, comparisons, chosen entities, saved plans, scene, viewport and trusted result snapshots. Refresh restores the active session, then re-queries. Historical price timestamps remain visible. History can restore/rename/delete; deletion and clearing require explicit confirmation. Starting fresh keeps older sessions. Media blobs are intentionally not saved; precise location is kept only after explicit selection, never tracked continuously.

## Mobile

Chat / Shopping / Map bottom tabs preserve shared state instead of shrinking desktop columns. Details/filter/history use bottom sheets with focus handling. Product cards use two columns down to 320 px. Large comparison tables scroll within their own container. Safe-area spacing, reduced motion, dark theme, visible keyboard focus and Persian-first text are shared across views. A phone's actual microphone permission and virtual keyboard still depend on its browser/OS; desktop emulation is not a substitute for physical-device testing.
