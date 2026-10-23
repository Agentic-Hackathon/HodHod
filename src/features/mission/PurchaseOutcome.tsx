import type { Offer } from "../../data/types";
import { useStore } from "../../state/store";
import { Button } from "../../components/primitives";
import type { VisitOutcome } from "./types";

export const outcomeLabels: Record<VisitOutcome, string> = {
  confirmed: "موجودی را تأیید کردم",
  no_answer: "پاسخ نداد",
  sold_out: "موجود نبود",
  closed: "بسته بود",
  purchased: "خریدم",
};
export function PurchaseOutcome({
  offer,
  replan = false,
}: {
  offer: Offer;
  replan?: boolean;
}) {
  const { session: s, reportVisit, set } = useStore();
  if (!s.mission) return null;
  const current = [...(s.visitReports || [])]
    .reverse()
    .find((r) => r.offerId === offer.id && r.missionId === s.mission!.id);
  return (
    <section className="purchase-outcome" aria-label="نتیجهٔ پیگیری خرید">
      <h4>پیگیری این انتخاب</h4>
      <div className="outcome-actions">
        {(Object.entries(outcomeLabels) as [VisitOutcome, string][]).map(
          ([outcome, label]) => (
            <button
              key={outcome}
              aria-pressed={current?.outcome === outcome}
              onClick={() => {
                reportVisit(offer, outcome);
                if (
                  replan &&
                  ["sold_out", "closed", "no_answer"].includes(outcome)
                )
                  set({ scene: "mission" });
              }}
            >
              {label}
            </button>
          ),
        )}
      </div>
      {current && (
        <small>
          گزارش شما · {outcomeLabels[current.outcome]} ·{" "}
          {new Intl.DateTimeFormat("fa-IR", {
            timeZone: "Asia/Tehran",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(current.at))}
        </small>
      )}
      {replan && (
        <Button onClick={() => set({ scene: "mission" })}>
          بازگشت به پیشنهادها و جایگزین‌ها
        </Button>
      )}
    </section>
  );
}
