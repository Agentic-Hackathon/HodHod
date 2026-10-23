import { describe, it, expect, vi } from "vitest";
import { EnvelopeSchema, BlockSchema } from "../../src/generative-ui/schema";
import { LatestRequest, RemoteAgentAdapter } from "../../src/agent/adapters";
import { haversine, money, safeUrl } from "../../src/i18n/format";
import { validateImage } from "../../src/features/chat/inputs";
const envelope = {
  protocolVersion: 1,
  kind: "workspace.render",
  sessionId: "s",
  requestId: "r",
  scene: "results",
  blocks: [{ id: "one", type: "product_grid", props: { productIds: ["p"] } }],
  meta: { source: "dataset", inventoryVerified: false },
};
describe("trusted generative contract", () => {
  it("deduplicates concurrent requests with the same correlation ID", async () => {
    let finish!: (r: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          finish = r;
        }),
    );
    const adapter = new RemoteAgentAdapter(
      "http://local",
      fetcher as typeof fetch,
    );
    const req = {
      protocolVersion: 1 as const,
      sessionId: "s",
      requestId: "r",
      action: { type: "message.send" as const },
      filters: {
        query: "",
        category: "",
        min: "",
        max: "",
        radius: 1,
        nearby: false,
      },
      location: null,
      page: 0,
    };
    const a = adapter.dispatch(req, new AbortController().signal, () => {}),
      b = adapter.dispatch(req, new AbortController().signal, () => {});
    expect(a).toBe(b);
    finish(new Response(JSON.stringify(envelope)));
    await a;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts versioned entity IDs", () =>
    expect(EnvelopeSchema.parse(envelope).blocks[0].props.productIds).toEqual([
      "p",
    ]));
  it("rejects model HTML and factual price injection", () =>
    expect(
      BlockSchema.safeParse({
        id: "x",
        type: "product_grid",
        props: { html: "<script/>", price: 12 },
      }).success,
    ).toBe(false));
  it("rejects unsupported version and live inventory claims", () => {
    expect(
      EnvelopeSchema.safeParse({ ...envelope, protocolVersion: 2 }).success,
    ).toBe(false);
    expect(
      EnvelopeSchema.safeParse({
        ...envelope,
        meta: { source: "dataset", inventoryVerified: true },
      }).success,
    ).toBe(false);
  });
  it("allows unknown types for safe fallback", () =>
    expect(
      BlockSchema.parse({ id: "x", type: "future_widget", props: {} }).type,
    ).toBe("future_widget"));
  it("supersedes and aborts old requests", () => {
    const l = new LatestRequest(),
      a = l.begin(),
      b = l.begin();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
    expect(b.isCurrent()).toBe(true);
    l.cancel();
    expect(b.isCurrent()).toBe(false);
  });
  it("checks correlation on remote replies", async () => {
    const adapter = new RemoteAgentAdapter(
      "https://example.test",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...envelope, requestId: "wrong" })),
      ) as typeof fetch,
    );
    await expect(
      adapter.dispatch(
        {
          protocolVersion: 1,
          sessionId: "s",
          requestId: "r",
          action: { type: "message.send" },
          filters: {
            query: "",
            category: "",
            min: "",
            max: "",
            radius: 1,
            nearby: false,
          },
          location: null,
          page: 0,
        },
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("مطابقت");
  });
  it("parses chunked SSE status and final envelope", async () => {
    const chunks = [
      "data: " +
        JSON.stringify({ kind: "progress", requestId: "r", text: "working" }) +
        "\n\n",
      "data: " + JSON.stringify(envelope) + "\n\n",
    ];
    const stream = new ReadableStream({
      start(c) {
        chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x)));
        c.close();
      },
    });
    const adapter = new RemoteAgentAdapter(
      "http://localhost",
      vi.fn(
        async () =>
          new Response(stream, {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ) as typeof fetch,
    );
    const progress = vi.fn();
    const r = await adapter.dispatch(
      {
        protocolVersion: 1,
        sessionId: "s",
        requestId: "r",
        action: { type: "message.send" },
        filters: {
          query: "",
          category: "",
          min: "",
          max: "",
          radius: 1,
          nearby: false,
        },
        location: null,
        page: 0,
      },
      new AbortController().signal,
      progress,
    );
    expect(progress).toHaveBeenCalledWith("working");
    expect(r.envelope.requestId).toBe("r");
  });
});
describe("factual presentation and inputs", () => {
  it("calculates direct distance, zero and antipodes", () => {
    expect(haversine({ lat: 35, lon: 51 }, { lat: 35, lon: 51 })).toBe(0);
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(
      111.195,
      2,
    );
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(
      20015.087,
      1,
    );
  });
  it("does not turn unknown price into zero", () => {
    expect(money(null)).toBe("قیمت نامشخص");
    expect(money(0)).not.toBe(money(null));
  });
  it("blocks unsafe URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://image.torob.com/test.jpg")).toContain("https:");
  });
  it("validates image size/type without pretending recognition", () => {
    expect(
      validateImage(
        new File(["x"], "a.exe", { type: "application/octet-stream" }),
      ),
    ).toContain("تصویر");
    expect(
      validateImage(
        new File([new Uint8Array(9 * 1024 * 1024)], "a.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).toContain("۸");
    expect(
      validateImage(new File(["x"], "a.jpg", { type: "image/jpeg" })),
    ).toBe(null);
  });
});
