# Actual Torob dataset mapping

Inspected `README.txt` and all three UTF-8 CSVs in `the repository root`. Nested arrays/objects are compact JSON. Literal `null` and empty CSV fields normalize to null; valid numeric zero stays zero. IDs remain original opaque strings and are never interchangeable. Files are not modified. Machine-readable full inspection, column-level missingness and privacy-safe raw samples: [DATA_INSPECTION.json](DATA_INSPECTION.json).

## Verified corpus

| File         | Actual rows | Raw columns                                                                                                                                               |
| ------------ | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shops.csv    |       6,476 | address, category_names, contacts, instagram, lat, location_label, lon, name, payment_options, shop_id, supports_fast_delivery, website_url, weekly_hours |
| products.csv |     225,903 | brand_name, category_name, image_urls, model, persian_title, product_id, specs                                                                            |
| offers.csv   |     331,506 | description, last_price_changed_at, offer_id, price_toman, product_id, seller_title, shop_id, warranty                                                    |

All 331,506 offer product/shop foreign keys resolve. All 6,476 coordinate pairs are finite and in legal latitude/longitude ranges; this checks validity, not independent surveying accuracy. Initial full streamed import measured **14.83 s** on this machine. Data sizes: shops 9,202,900 B, products 196,150,238 B, offers 79,945,479 B. Dataset export timestamps are distinct from today's date and from price-change times.

## Normalized entities and provenance

| Entity  | Raw → frontend                                 | Type / handling                                                                                                                                      |
| ------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product | product_id → id                                | string primary key                                                                                                                                   |
| Product | persian_title → title                          | source string; two missing titles receive the explicit placeholder «عنوان ثبت نشده»                                                                  |
| Product | category_name → category                       | nullable string; no parent/category hierarchy exists                                                                                                 |
| Product | brand_name, model → brand, model               | nullable strings                                                                                                                                     |
| Product | image_urls → images                            | parsed URL string array, load failure placeholder, HTTPS/HTTP only                                                                                   |
| Product | specs → specs                                  | parsed list of key, section, value; display source values, no invented specifications                                                                |
| Shop    | shop_id → id                                   | independent string primary key                                                                                                                       |
| Shop    | name → name                                    | source name; syntheticName flag inferred from absence of website/Instagram, per organizer's stated rule                                              |
| Shop    | lat, lon → lat, lon                            | finite numbers or null; illegal/missing pairs excluded from map/distance                                                                             |
| Shop    | address, location_label → address, area        | nullable text; preserve mall/floor/unit embedded in address, no fabricated separate floor columns                                                    |
| Shop    | category_names → categories                    | parsed flat string list; not proof of selling a product                                                                                              |
| Shop    | weekly_hours → hours                           | object keyed sat/sun/mon/tue/wed/thu/fri, status + shifts.start_time/end_time; `{}` means unknown, explicit closed means closed in recorded schedule |
| Shop    | payment_options → payments                     | objects: provider_name, channel, category_names, min_price_toman, max_price_toman; unknown channel never shown as confirmed in-person acceptance     |
| Shop    | supports_fast_delivery → fastDelivery          | boolean/null; null is unknown                                                                                                                        |
| Shop    | website_url, instagram → website, instagram    | optional source strings; only safe HTTP(S) website links become clickable                                                                            |
| Shop    | contacts                                       | intentionally omitted from API and persisted entities; all phones synthetic; no contact action                                                       |
| Offer   | offer_id → id                                  | independent string primary key                                                                                                                       |
| Offer   | product_id, shop_id → productId, shopId        | joins products.id and shops.id respectively                                                                                                          |
| Offer   | price_toman → price, currency                  | finite nonnegative numeric amount or null; currency always explicitly تومان, no conversion                                                           |
| Offer   | last_price_changed_at → changedAt              | original nullable ISO timestamp; display Persian calendar in Asia/Tehran, invalid dates display unknown                                              |
| Offer   | seller_title, description → title, description | nullable source text                                                                                                                                 |
| Offer   | warranty → warranty                            | parsed object containing provider, period_months, description; Persian labels and missing-detail handling                                            |
| Offer   | inventoryVerified                              | constant false, clearly a factual limitation, not a CSV column                                                                                       |

Search normalization uses NFKC, Arabic yeh/kaf → Persian ی/ک, ZWNJ → space and lowercase. Display retains original source values. FTS5 does deterministic AND-prefix token search, not semantic interpretation. BaseProduct data never inherit seller-specific warranty or price; those remain on Offer.

## Missingness that changes UX

| Field                          | Missing raw rows |
| ------------------------------ | ---------------: |
| shops.instagram                |            6,454 |
| shops.website_url              |            6,386 |
| shops.supports_fast_delivery   |            4,875 |
| shops.address / location_label |           1 each |
| products.model                 |          221,847 |
| products.brand_name            |          168,269 |
| products.persian_title         |                2 |
| offers.price_toman             |           15,083 |
| offers.last_price_changed_at   |              769 |
| offers.description             |          293,129 |
| offers.warranty                |          272,563 |

Empty JSON arrays/objects are additionally handled as no recorded detail; the table above counts raw null/empty fields, not empty nested collections. Unknown price is never displayed as zero; known-price filters exclude unknown prices. Unknown inventory remains unknown even for a fresh price timestamp. Hours are a recorded schedule, never a guarantee of being open on arrival. Payment filtering can require an explicitly `in_person` channel; provider-only matches retain channel uncertainty. Warranty filter means recorded warranty text/object, not independent verification.

## Query semantics and coverage

Products appear only through matching offers. The same price/shop/radius/payment/warranty conditions filter returned offers and the product-existence predicate, preventing an unrelated cheap offer from sneaking into a constrained result. Product pages are capped at 48 (UI uses 12). `shop`, `bounds` and category filters are server-side. Direct-radius filtering uses the same tested Haversine formula as presentation. Map uses `[longitude, latitude]`; entity data remain named `lat`/`lon`.

Organizer caveats: selectively sampled Tehran coverage, up to 300 listed products per shop, 6,364 synthetic shop names and all synthetic phones. Presence of an offer does not establish live availability; last price change is not a live-price check. No results means absent from this bounded dataset with the selected constraints, never absent everywhere in Tehran. Real named/website examples are retained for consistent data display, not seller endorsement. No original contacts are published in the UI or machine-readable sample.
