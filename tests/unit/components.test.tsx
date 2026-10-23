import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  GenerativeCanvasRenderer,
  RegistryContext,
} from "../../src/generative-ui/registry";
import {
  PriceFreshness,
  AvailabilityUnverifiedNotice,
  EmptyResultsAndRelaxFilters,
} from "../../src/components/commerce";
import { useStore, fresh } from "../../src/state/store";
afterEach(cleanup);
describe("safe renderer and state", () => {
  it("renders unknown block fallback without code execution", () => {
    render(
      <GenerativeCanvasRenderer
        blocks={[{ id: "1", type: "<script>", props: {} }]}
      />,
    );
    expect(screen.getByText(/پشتیبانی نمی‌شود/)).toBeTruthy();
  });
  it("renders allowlisted component through context", () => {
    const renderBlock = vi.fn(() => <p>real component</p>);
    render(
      <RegistryContext.Provider value={{ render: renderBlock }}>
        <GenerativeCanvasRenderer
          blocks={[
            { id: "1", type: "product_grid", props: { productIds: ["real"] } },
          ]}
        />
      </RegistryContext.Provider>,
    );
    expect(renderBlock).toHaveBeenCalledWith("product_grid", {
      productIds: ["real"],
    });
  });
  it("keeps unknown inventory visible", () => {
    render(<AvailabilityUnverifiedNotice />);
    expect(screen.getByText("موجودی تأیید نشده")).toBeTruthy();
  });
  it("does not relax filters until user acts", () => {
    useStore.setState({
      session: {
        ...fresh(),
        filters: {
          query: "x",
          category: "c",
          min: "1",
          max: "2",
          radius: 1,
          nearby: true,
        },
      },
    });
    render(<EmptyResultsAndRelaxFilters />);
    expect(useStore.getState().session.filters.query).toBe("x");
    fireEvent.click(screen.getByRole("button"));
    expect(useStore.getState().session.filters.query).toBe("");
  });
  it("retains pinned selections while filters change", () => {
    const s = fresh();
    s.compare = ["p"];
    s.saved = ["q"];
    useStore.setState({ session: s });
    useStore.getState().filter({ query: "new" });
    expect(useStore.getState().session.compare).toEqual(["p"]);
    expect(useStore.getState().session.saved).toEqual(["q"]);
  });
});
