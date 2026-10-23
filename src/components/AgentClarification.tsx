import { useStore } from '../state/store';
import type { Action } from '../data/types';
export function AgentClarification({ onAction }: { onAction: (action: Action, label: string) => void }) {
  const context = useStore(s => s.session.agentContext);
  const question = context?.clarification;
  if (!question?.question || !question.field || !context?.candidateSetId) return null;
  return <section className="agent-clarification" aria-label="پرسش تکمیلی دستیار">
    <h3>{question.question}</h3>
    <div>{question.options.map((option, i) => <button key={i} onClick={() => onAction({ type: 'agent.clarify', payload: { candidateSetId: context.candidateSetId, field: question.field, value: option.value } }, option.label)}>{option.label}{option.count !== undefined && <small>{new Intl.NumberFormat('fa-IR').format(option.count)} گزینه</small>}</button>)}</div>
    <small>می‌توانید پاسخ را در گفت‌وگو هم بنویسید.</small>
  </section>;
}
