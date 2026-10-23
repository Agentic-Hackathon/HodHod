# Agent integration v1

The supplied HodHod backend is now connected by default through `BackendAgentAdapter`; see [BACKEND_CONNECTION.md](BACKEND_CONNECTION.md). The generic Remote transport below remains available for alternate integrations and compatibility tests.

**Target:** `src/agent/adapters.ts`, interface `AgentAdapter`. UI/business components do not depend on an LLM SDK or agent framework. The agent owner supplies retrieval/ranking/conversation logic. Demo uses the real local data API with deterministic filtering.

## Wire transport

Set `VITE_AGENT_ENDPOINT=http://127.0.0.1:9000/agent`, restart Vite and select Remote in Help. `getStatus` GETs `<endpoint>/health`. `dispatch` POSTs `<endpoint>` with JSON and `X-Request-ID`. Backend must allow the frontend origin if served cross-origin. No secrets in VITE variables. HTTP JSON and standard `text/event-stream` responses are supported; this is a small custom v1 protocol, **not a claim of full AG-UI compatibility**. A future transport can implement `AgentAdapter` without changing components.

```json
{
  "protocolVersion": 1,
  "sessionId": "session-example",
  "requestId": "request-example",
  "action": { "type": "message.send", "payload": { "text": "هدفون" } },
  "filters": {
    "query": "هدفون",
    "category": "",
    "min": "",
    "max": "",
    "radius": 1,
    "nearby": false
  },
  "location": null,
  "page": 0
}
```

Respond with stable source IDs; sample IDs below are **illustrative, not dataset facts**:

```json
{
  "protocolVersion": 1,
  "kind": "workspace.render",
  "sessionId": "session-example",
  "requestId": "request-example",
  "scene": "results",
  "blocks": [
    {
      "id": "products",
      "type": "product_grid",
      "props": { "productIds": ["product_example"] }
    },
    {
      "id": "offers",
      "type": "offer_list",
      "props": { "offerIds": ["offer_example"] }
    },
    {
      "id": "map",
      "type": "store_map",
      "props": { "shopIds": ["shop_example"] }
    },
    { "id": "source", "type": "source_disclosure", "props": {} }
  ],
  "meta": { "source": "dataset", "inventoryVerified": false }
}
```

The UI resolves IDs through `/api/entities?kind=products|shops|offers&ids=...` and expands offer product/shop references. It does **not** trust model-supplied factual prices, inventory, coordinates, or arbitrary HTML/JS/CSS. Supply associated offers for a product grid if prices are needed. Unknown source IDs are omitted rather than invented. `explanationId` is reserved; v1 displays a deterministic explanation from session priority, not arbitrary model factual claims.

SSE sends UTF-8 events separated by blank lines, including chunk boundaries:

```text
data: {"kind":"progress","requestId":"request-example","text":"در حال دریافت فروشندگان"}

data: {"protocolVersion":1,"kind":"workspace.render","sessionId":"session-example","requestId":"request-example","scene":"results","blocks":[],"meta":{"source":"dataset","inventoryVerified":false}}

```

Progress is incremental; render envelopes are validated as received, and the last valid render envelope is committed when the stream completes. Intermediate canvas deltas and assistant-text streaming are not implemented in v1. Keep genuine progress messages short; do not expose hidden chain-of-thought. Cancel aborts the HTTP reader. Demo progress reflects real local request transitions and is labeled Demo, not fabricated tool execution.

## Major scene examples

| Scene      | Block types and ID props                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| welcome    | `dynamic_form {}`, `category_explorer {}`                                                                                         |
| categories | `category_explorer {}` (actual flat categories)                                                                                   |
| results    | `product_grid {productIds}`, `offer_list {offerIds}`, `source_disclosure {}`                                                      |
| map        | `store_map {shopIds}`, `offer_list {offerIds}`                                                                                    |
| compare    | `product_comparison {productIds}`, or `seller_comparison {offerIds}`                                                              |
| decision   | `price_distance_plot {offerIds}`, `decision_explanation {explanationId}`                                                          |
| visit      | `visit_summary {offerIds:[chosenOfferId]}`, `inquiry_draft {offerIds:[chosenOfferId]}`; omitted IDs use the user's selected offer |
| saved      | `saved_collection {}` reads user's pinned collection                                                                              |
| no matches | scene results + `empty_results {}`, explicit relax-filter action                                                                  |

The executable Zod schema is `src/generative-ui/schema.ts`. `KnownBlockSchema` has literal discriminants. The wire `BlockSchema` intentionally accepts future type strings but strictly allowlists prop keys; `UnknownUIBlock` renders a safe notice. Limits: 20 blocks/envelope, 48 product IDs/block and 100 offer/shop IDs/block. `meta.inventoryVerified` must be false for this snapshot-only integration. Protocol changes require version negotiation and a new schema.

## Action events

`src/state/events.ts` is the frontend event bus. The canonical state updates immediately; remote dispatch receives the action and current filters/location, so users need not send chat text for each control.

| Action                                      | Payload                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| message.send                                | text                                                              |
| category.select                             | category and changed query filters                                |
| filter.change                               | changed min/max/radius/payment/warranty/nearby                    |
| location.change                             | lat, lon, label; open:true is local picker intent only            |
| map.bounds.change                           | bounds west,south,east,north                                      |
| product.select / shop.select / offer.select | productId / shopId / offerId                                      |
| compare.add / compare.remove                | productId                                                         |
| route.request                               | shopId, mode                                                      |
| visit.save                                  | offerId                                                           |
| session.restore                             | sessionId                                                         |
| image.attach                                | filename/MIME/size metadata; image bytes are not in this protocol |
| voice.transcription.edit                    | editable text from browser recognition                            |

Image bytes must be handled by implementing `ImageUnderstandingAdapter` in `features/chat/inputs.ts`; audio files by `AudioTranscriptionAdapter`. These are intentionally unconnected. Attachments remain transient and are not persisted. UI action event dispatch is notification/rendering only: it must not silently contact sellers, purchase, reserve stock or perform irreversible side effects.

## Recovery, correlation and retries

Each dispatch receives fresh session/request IDs and an AbortSignal. LatestRequest aborts superseded work and guards resolution after async entity lookups. The app checks session equality before commit; the remote adapter checks envelope correlation and deduplicates concurrent dispatches with identical session/request IDs. Earlier data cannot overwrite a newer request. Backend should treat `X-Request-ID` as a correlation/idempotency key and reject conflicting duplicates; current client does not retry automatically, preventing duplicate side effects. Explicit retry emits a new request with current canonical state. A disconnected endpoint leaves prior results available with a notice and a Demo fallback button. Malformed/unsupported protocol envelopes fail validation rather than executing or partially trusting their contents. Unsupported future component types degrade independently.
# Unified comparison block

The new `shopping_mission` block and `mission` scene support time-sensitive in-person shopping. Its validated intent props, events, canonical request context and evidence limitations are specified in [URGENT_SHOPPING.md](URGENT_SHOPPING.md).

Use `comparison_workspace` to present specifications, geographic shop comparison, route preview and price/distance Pareto together. Supply actual `productIds` for different products or actual `offerIds` for the sellers of one product. Optional `shopIds` restrict the available shop records. The existing entity resolver fetches referenced records and related products/shops; never generate prices or coordinates in block props. Individual comparison and plot blocks remain available for existing agents. Canonical `filters.priceStatus` is optional and accepts `all`, `known` or `unknown`; the search API uses the same parameter name. See [UX_COMPARISON_UPDATE.md](UX_COMPARISON_UPDATE.md) for filtering and distance semantics.
