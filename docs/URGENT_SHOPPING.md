# Urgent in-person shopping

The new **خرید فوری** flow answers: where can I visit, will I arrive before closing, and what should happen if the purchase fails?

## Try it

Start from **همین امشب لازم دارم** or **خرید فوری**, or open **سناریوهای نمایشی → خرید آخر شب · شارژر ساعت ۲۳:۳۰**. The scenario selects the public جمهوری neighborhood and 23:30 Tehran time. Products, prices, coordinates and schedules come from the actual CSV index; no special seller, opening time or price is seeded for the scenario. All settings can be edited through the compact **تغییر نیاز و زمان** disclosure.

The local chat recognizes a limited set of urgent phrases, Persian/Arabic digits, an explicitly stated hour and walking preference. It is a deterministic convenience parser, not a general LLM. Charger requests require a device-purpose category; phone charger searches use the actual `شارژر گوشی` dataset category. Essential title terms narrow the search. Title/category matching is never presented as verified technical compatibility.

## Decision and search

`GET /api/mission?q=...&category=...&required=...&lat=...&lon=...&departure=ISO_WITH_OFFSET&radius=2&max=...`

The read-only SQL query searches all matching source offers within 30 km before shortlisting, applies category/title/budget constraints, and picks the least expensive known-priced eligible offer per shop. It returns up to 12 shops with recorded open hours at departure, 6 with unknown hours and 6 closed shops, each ordered by geographic distance. This deliberately includes farther open shops even if many nearer ones are closed. Radius-specific open/closed/unknown counts describe the departure time, not arrival or live stock. The snapshot includes the total matching shop count and explicit shortlist size.

The frontend initially requests actual routing for up to 6 shops in the selected travel mode, with an explicit action to examine more. Route replies arrive incrementally and use the existing shared routing cache/gateway. Arrival eligibility checks the Tehran schedule at arrival and the requested shopping buffer (default 10 minutes), including overnight shifts. Ranking favors a feasible visit, then a user-confirmed stock report, response history and route duration. Unknown hours or unavailable routes never become a feasible visit. A nearer closing shop cannot outrank a farther feasible one. No traffic prediction, invented ETA or live-inventory claim is made. Recommendations are scoped to the examined shortlist and routes.

The primary card explains arrival, route duration, approximate minutes until closing, recorded price timestamp and stock evidence. A fallback card, source product specifications and a synchronized geographic map are available in the same flow. Remaining options are collapsed by default.

## Feedback and recovery

`confirmed`, `no_answer`, `sold_out`, `closed`, `purchased` are explicit user reports, timestamped and scoped to this shopping mission. They never mutate CSV offers or `inventoryVerified: false`. Closed-shop and unavailable-offer IDs are sent back to the shortlist endpoint so new source candidates can replace them. No response lowers priority; it does not imply no stock. Reports can be undone. Changing the shopping query or charger purpose starts a new mission so previous purchase success/failure does not leak into a new need.

The visit plan exposes the same controls and returns to replanning after a failure. A user can update origin and departure together after arriving somewhere. The mission, source snapshot and reports persist in the existing local session store. Route times are not fabricated on offline recovery. Contact numbers in the supplied CSV are synthetic, so no automatic calls or messages are sent.

## Exploratory places

`GET /api/explore?lat=...&lon=...&kind=electronics|clothes|general&radius=2000`

This is a separate, user-triggered layer of OpenStreetMap POIs through Overpass. It never produces Torob offers, prices, confirmed stock or claims that a POI is absent from Torob. Each place has its source URL and fetch timestamp; opening-hours tags are displayed as source text and are not parsed into a live-open claim. Map layer switching keeps these POIs separate from source-offer shops.

The service is bounded to 5 km, caps source results at 60, serializes requests, caches successes for 15 minutes and failures for 30 seconds, and backs off on HTTP 406/429. `TOROB_OVERPASS_URL` configures the deployment endpoint; the default is the public Private.coffee instance listed in the [official Overpass instance documentation](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances). See [opening-hours tagging](https://wiki.openstreetmap.org/wiki/Key:opening_hours) for the original data format.

Live checks from this environment returned unavailable (the main instance returned HTTP 406 and the alternate did not complete successfully). Browser tests verify success and failure using controlled external responses; no live POI success is claimed. Source-offer shopping continues when exploration is unavailable.

## Agent contract

New allowlisted block: `shopping_mission`, scene: `mission`. Optional, strictly validated `props.mission` configures the input intent only:

```json
{
  "id": "urgent-plan",
  "type": "shopping_mission",
  "props": {
    "mission": {
      "query": "شارژر",
      "category": "شارژر گوشی",
      "departure": "2026-10-23T23:30",
      "mode": "walking",
      "radius": 2,
      "shoppingMinutes": 10
    }
  }
}
```

Agents cannot supply invented prices, stock, shops or route times in these props. They can supply `required`, `max` and `onlyReady` with the same validated constraints. Local source services resolve all shopping candidates. Remote requests now include optional canonical `mission` and `visitReports`. Events: `mission.start`, `mission.change`, `mission.replan`, `visit.report`. Older clients/envelopes remain valid.

For the demo, show the first recommendation, report the shop closed or the item unavailable, inspect the changed alternative, then record success. Explain that hours, offer existence, technical compatibility and user-confirmed stock are distinct evidence.

## Verification

2026-10-23: production build and TypeScript checks succeeded. 54 unit tests, 11 full-dataset tests, 4 routing tests, 5 mission/exploration service tests and 21 browser tests passed (95 total). Browser coverage uses real SQLite products/offers/hours, with controlled routing and POI responses; it verifies charger-category isolation, arrival planning, a failed-shop exclusion, unavailable-item recovery through the visit page, purchase persistence, explicit exploratory evidence, responsive layouts and accessibility. Production offline reload remains covered. Live exploration did not succeed in this environment, as noted above.
