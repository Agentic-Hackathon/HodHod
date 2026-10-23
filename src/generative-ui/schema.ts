import { z } from "zod";
export const blockTypes = [
  "product_grid",
  "category_explorer",
  "store_map",
  "offer_list",
  "product_detail",
  "store_detail",
  "product_comparison",
  "comparison_workspace",
  "shopping_mission",
  "shopping_plan",
  "seller_comparison",
  "price_distance_plot",
  "decision_explanation",
  "dynamic_form",
  "visit_summary",
  "inquiry_draft",
  "saved_collection",
  "empty_results",
  "source_disclosure",
  "activity_timeline",
] as const;
export type BlockType = (typeof blockTypes)[number];
export const BlockSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.string().max(100),
    props: z
      .object({
        productIds: z.array(z.string()).max(48).optional(),
        shopIds: z.array(z.string()).max(100).optional(),
        offerIds: z.array(z.string()).max(100).optional(),
        explanationId: z.string().optional(),
        mission: z
          .object({
            query: z.string().trim().min(1).max(100),
            category: z.string().max(100).optional(),
            required: z.string().max(80).optional(),
            departure: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
              .optional(),
            mode: z.enum(["driving", "walking"]).optional(),
            radius: z.number().min(0.5).max(30).optional(),
            shoppingMinutes: z.number().int().min(5).max(60).optional(),
            max: z
              .string()
              .regex(/^\d{0,12}$/)
              .optional(),
            onlyReady: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export const EnvelopeSchema = z
  .object({
    protocolVersion: z.literal(1),
    kind: z.literal("workspace.render"),
    sessionId: z.string(),
    requestId: z.string(),
    scene: z.enum([
      "mission",
      "welcome",
      "results",
      "categories",
      "map",
      "compare",
      "decision",
      "visit",
      "saved",
      "gallery",
    ]),
    blocks: z.array(BlockSchema).max(20),
    meta: z
      .object({
        source: z.literal("dataset"),
        inventoryVerified: z.literal(false),
      })
      .strict(),
  })
  .strict();
export type UIBlock = z.infer<typeof BlockSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
// Known blocks have a discriminant; the wire also accepts future types for the safe fallback.
const known = <K extends BlockType>(type: K) =>
  BlockSchema.extend({ type: z.literal(type) });
export const KnownBlockSchema = z.discriminatedUnion("type", [
  known("product_grid"),
  known("category_explorer"),
  known("store_map"),
  known("offer_list"),
  known("product_detail"),
  known("store_detail"),
  known("product_comparison"),
  known("comparison_workspace"),
  known("shopping_mission"),
  known("seller_comparison"),
  known("price_distance_plot"),
  known("decision_explanation"),
  known("dynamic_form"),
  known("visit_summary"),
  known("inquiry_draft"),
  known("saved_collection"),
  known("empty_results"),
  known("source_disclosure"),
  known("activity_timeline"),
]);
export type KnownUIBlock = z.infer<typeof KnownBlockSchema>;
