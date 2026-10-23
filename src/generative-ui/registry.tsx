import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { UIBlock, BlockType } from "./schema";
import { UnknownUIBlock } from "../components/primitives";
export interface BlockContext {
  render: (type: BlockType, props: UIBlock["props"]) => ReactNode;
}
export const RegistryContext = createContext<BlockContext>({
  render: () => null,
});
export const UIComponentRegistry: Record<
  BlockType,
  { name: string; family: string }
> = {
  product_grid: { name: "ProductGrid", family: "discovery" },
  category_explorer: { name: "CategoryExplorer", family: "discovery" },
  store_map: { name: "StoreMap", family: "geo" },
  offer_list: { name: "OffersByProduct", family: "commerce" },
  product_detail: { name: "ProductDetail", family: "commerce" },
  store_detail: { name: "StoreDetailSheet", family: "commerce" },
  product_comparison: { name: "ProductComparison", family: "decision" },
  comparison_workspace: { name: "ComparisonWorkspace", family: "decision" },
  shopping_mission: { name: "ShoppingMissionWorkspace", family: "visit" },
  shopping_plan: { name: "ShoppingRoutePlan", family: "visit" },
  seller_comparison: { name: "SellerComparison", family: "decision" },
  price_distance_plot: { name: "PriceVsDistancePlot", family: "decision" },
  decision_explanation: { name: "DecisionExplanation", family: "decision" },
  dynamic_form: { name: "DynamicForm", family: "input" },
  visit_summary: { name: "VisitSummary", family: "visit" },
  inquiry_draft: { name: "StoreInquiryDraft", family: "visit" },
  saved_collection: { name: "SavedCollection", family: "visit" },
  empty_results: { name: "EmptyResultsAndRelaxFilters", family: "system" },
  source_disclosure: { name: "SourceDisclosure", family: "system" },
  activity_timeline: { name: "ToolActivityTimeline", family: "system" },
};
export function GenerativeCanvasRenderer({ blocks }: { blocks: UIBlock[] }) {
  const ctx = useContext(RegistryContext);
  useEffect(() => {
    blocks
      .filter((b) => !Object.hasOwn(UIComponentRegistry, b.type))
      .forEach((b) =>
        console.warn("Unsupported UI block", { id: b.id, type: b.type }),
      );
  }, [blocks]);
  return (
    <>
      {blocks.map((b) => (
        <div key={b.id} data-ui-block={b.type}>
          {Object.hasOwn(UIComponentRegistry, b.type) ? (
            ctx.render(b.type as BlockType, b.props)
          ) : (
            <UnknownUIBlock />
          )}
        </div>
      ))}
    </>
  );
}
