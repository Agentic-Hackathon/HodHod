import { EnvelopeSchema } from '../generative-ui/schema';
import type { AgentAdapter, AgentRequest, AgentReply } from './adapters';
export interface AgentContext {
  candidateSetId?: string | null; query?: string; count?: number;
  filters?: Record<string, unknown>;
  activity?: string[];
  compareMode?: 'products' | 'sellers';
  selectedOfferId?: string;
  visibleProductIds?: string[];
  selectedProductId?: string | null;
  clarification?: { question: string; field: string; options: { label: string; value: string | number | boolean; count?: number }[] } | null;
}
export interface BackendStatus { status: string; llmConfigured: boolean; model: string; provider: string; agentMode: string; catalogue: { products: number; offers: number } }
export class BackendAgentAdapter implements AgentAdapter {
  private csrf = '';
  status?: BackendStatus;
  private initialization?: Promise<void>;
  private async initialize(signal?: AbortSignal) {
    const r = await fetch('/api/brain/bootstrap/', { credentials: 'same-origin', signal });
    if (!r.ok) throw new Error('سرویس هدهد در دسترس نیست. برنامه را با start.ps1 اجرا کنید.');
    const data = await r.json(); this.csrf = data.csrfToken; this.status = data;
  }
  async getStatus(signal?: AbortSignal) {
    try { await this.initialize(signal); return this.status?.catalogue.products ? 'connected' as const : 'unavailable' as const; } catch { return 'unavailable' as const; }
  }
  async dispatch(request: AgentRequest, signal: AbortSignal, progress: (text: string) => void): Promise<AgentReply> {
    if (!this.csrf) {
      this.initialization ||= this.initialize().finally(() => { this.initialization = undefined; });
      await this.initialization;
    }
    progress(request.action.type === 'message.send' ? 'دستیار در حال بررسی درخواست و ابزارهای خرید است…' : 'به‌روزرسانی گزینه‌های خرید…');
    const perform = () => fetch('/api/brain/dispatch/', { method: 'POST', credentials: 'same-origin', signal, headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.csrf }, body: JSON.stringify(request) });
    let response = await perform();
    if (response.status === 403) { await this.initialize(signal); response = await perform(); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'دریافت پاسخ هدهد انجام نشد. دوباره تلاش کنید.');
    const envelope = EnvelopeSchema.parse(data.envelope);
    if (envelope.sessionId !== request.sessionId || envelope.requestId !== request.requestId) throw new Error('شناسهٔ پاسخ دستیار مطابقت ندارد.');
    return { envelope, results: data.results, text: data.text || undefined, context: data.context };
  }
}
