import { EnvelopeSchema, type Envelope } from "../generative-ui/schema";
import type { Action, Filters, Location, Results } from "../data/types";
import { search } from "../data/api";
import type { ShoppingMission, VisitReport } from "../features/mission/types";
import type { AgentContext } from './backend';
export interface AgentRequest {
  protocolVersion: 1;
  sessionId: string;
  requestId: string;
  action: Action;
  filters: Filters;
  location: Location | null;
  page: number;
  mission?: ShoppingMission;
  visitReports?: VisitReport[];
  messages?: { role: 'user' | 'assistant'; text: string }[];
  context?: AgentContext;
}
export interface AgentReply {
  envelope: Envelope;
  results?: Results;
  text?: string;
  context?: AgentContext;
}
export interface AgentAdapter {
  getStatus(
    signal?: AbortSignal,
  ): Promise<"connected" | "demo" | "unavailable">;
  dispatch(
    request: AgentRequest,
    signal: AbortSignal,
    onProgress: (text: string) => void,
  ): Promise<AgentReply>;
}
export class DemoAgentAdapter implements AgentAdapter {
  async getStatus() {
    return "demo" as const;
  }
  async dispatch(
    r: AgentRequest,
    signal: AbortSignal,
    progress: (text: string) => void,
  ): Promise<AgentReply> {
    progress("حالت نمایشی · درخواست دادهٔ واقعی");
    const results = await search(r.filters, r.location, r.page, signal);
    progress("دریافت داده کامل شد");
    return {
      results,
      text: results.total
        ? "نتایج ثبت‌شده آماده‌اند. می‌توانید فروشندگان را مقایسه کنید یا روی نقشه ببینید."
        : "در داده‌های ما با این شرط‌ها نتیجه‌ای پیدا نشد. می‌توانید فیلترها را تغییر دهید.",
      envelope: EnvelopeSchema.parse({
        protocolVersion: 1,
        kind: "workspace.render",
        sessionId: r.sessionId,
        requestId: r.requestId,
        scene: "results",
        blocks: [
          {
            id: "results",
            type: results.total ? "product_grid" : "empty_results",
            props: { productIds: results.products.map((p) => p.id) },
          },
          { id: "source", type: "source_disclosure", props: {} },
        ],
        meta: { source: "dataset", inventoryVerified: false },
      }),
    };
  }
}
export class RemoteAgentAdapter implements AgentAdapter {
  private inflight = new Map<string, Promise<AgentReply>>();
  constructor(
    private endpoint: string,
    private transport: typeof fetch = fetch,
  ) {}
  async getStatus(signal?: AbortSignal) {
    if (!this.endpoint) return "unavailable" as const;
    try {
      const r = await this.transport(this.endpoint + "/health", { signal });
      return r.ok ? ("connected" as const) : ("unavailable" as const);
    } catch {
      return "unavailable" as const;
    }
  }
  dispatch(
    request: AgentRequest,
    signal: AbortSignal,
    progress: (text: string) => void,
  ): Promise<AgentReply> {
    const key = request.sessionId + ":" + request.requestId;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = this.dispatchTransport(request, signal, progress);
    this.inflight.set(key, promise);
    promise.then(
      () => this.inflight.delete(key),
      () => this.inflight.delete(key),
    );
    return promise;
  }
  private async dispatchTransport(
    request: AgentRequest,
    signal: AbortSignal,
    progress: (text: string) => void,
  ): Promise<AgentReply> {
    if (!this.endpoint)
      throw new Error(
        "نشانی سرویس دستیار تنظیم نشده است. حالت نمایشی در دسترس است.",
      );
    const response = await this.transport(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": request.requestId,
      },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok)
      throw new Error("ارتباط با دستیار برقرار نشد. دوباره تلاش کنید.");
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("جریان پاسخ خالی است.");
      let buffer = "",
        last: Envelope | undefined;
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        buffer = (buffer + decoder.decode(value, { stream: !done })).replace(
          /\r\n/g,
          "\n",
        );
        let index;
        while ((index = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const data = event
            .split("\n")
            .filter((x) => x.startsWith("data:"))
            .map((x) => x.slice(5).trimStart())
            .join("\n");
          if (data) {
            const v = JSON.parse(data);
            if (
              v.kind === "progress" &&
              typeof v.text === "string" &&
              v.requestId === request.requestId
            )
              progress(v.text);
            else {
              last = EnvelopeSchema.parse(v);
              this.correlate(last, request);
            }
          }
        }
        if (done) break;
      }
      if (!last) throw new Error("پاسخ معتبری از دستیار دریافت نشد.");
      return { envelope: last };
    }
    const envelope = EnvelopeSchema.parse(await response.json());
    this.correlate(envelope, request);
    return { envelope };
  }
  private correlate(e: Envelope, r: AgentRequest) {
    if (e.sessionId !== r.sessionId || e.requestId !== r.requestId)
      throw new Error("شناسهٔ پاسخ با درخواست مطابقت ندارد.");
  }
}
export class LatestRequest {
  private abort?: AbortController;
  private version = 0;
  begin() {
    this.abort?.abort();
    this.abort = new AbortController();
    const version = ++this.version;
    return {
      signal: this.abort.signal,
      isCurrent: () => version === this.version && !this.abort?.signal.aborted,
    };
  }
  cancel() {
    this.abort?.abort();
    this.version++;
  }
}
