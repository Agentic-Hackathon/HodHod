import { useEffect, useState } from "react";
import { api } from "../data/api";
import type { Filters } from "../data/types";
import { money } from "../i18n/format";
export interface PriceDistribution {
  quantiles: number[];
  histogram: number[];
  count: number;
}
export function BudgetPicker({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const [data, setData] = useState<PriceDistribution | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api<PriceDistribution>(
      "price-range?" +
        new URLSearchParams({ category: value.category, q: value.query }),
      c.signal,
    )
      .then(setData)
      .catch(() => {});
    return () => c.abort();
  }, [value.category, value.query]);
  const q = data?.quantiles || Array.from({ length: 101 }, () => 0);
  const closest = (n: number) =>
    q.reduce((a, b, i) => (Math.abs(b - n) < Math.abs(q[a] - n) ? i : a), 0);
  const low = value.min ? closest(Number(value.min)) : 0,
    high = value.max ? closest(Number(value.max)) : 100;
  const label = (v: string, empty: string) =>
    v ? money(Number(v)) + " تومان" : empty;
  return (
    <section className="budget-picker">
      <div className="field-heading">
        <h3>بودجهٔ شما</h3>
        <button
          type="button"
          className="text-link"
          onClick={() => onChange({ min: "", max: "" })}
        >
          بدون محدودیت
        </button>
      </div>
      <div className="budget-total">
        <span>{label(value.min, "از هر قیمتی")}</span>
        <span>—</span>
        <strong>{label(value.max, "تا هر قیمتی")}</strong>
      </div>
      <div className="price-histogram" aria-hidden="true">
        {(data?.histogram || Array.from({ length: 24 }, () => 1)).map(
          (n, i) => (
            <i
              key={i}
              style={{
                height: `${12 + (n / Math.max(...(data?.histogram || [1]), 1)) * 48}px`,
              }}
            />
          ),
        )}
      </div>
      <div className="budget-sliders">
        <label>
          از
          <input
            type="range"
            aria-label="حداقل بودجه"
            disabled={!data?.count}
            min="0"
            max="100"
            value={low}
            onChange={(e) => {
              const index = Math.min(Number(e.target.value), high);
              onChange({ min: index ? String(q[index]) : "" });
            }}
          />
        </label>
        <label>
          تا
          <input
            type="range"
            aria-label="حداکثر بودجه"
            disabled={!data?.count}
            min="0"
            max="100"
            value={high}
            onChange={(e) => {
              const index = Math.max(Number(e.target.value), low);
              onChange({ max: index === 100 ? "" : String(q[index]) });
            }}
          />
        </label>
      </div>
      <div className="budget-presets">
        {[
          { label: "اقتصادی", index: 25 },
          { label: "میانه", index: 50 },
          { label: "انتخاب بازتر", index: 75 },
        ].map((p) => (
          <button
            type="button"
            key={p.label}
            disabled={!data?.count}
            aria-pressed={value.max === String(q[p.index])}
            onClick={() => onChange({ min: "", max: String(q[p.index]) })}
          >
            <strong>{p.label}</strong>
            <small>
              {data ? "تا " + money(q[p.index]) + " تومان" : "در حال دریافت…"}
            </small>
          </button>
        ))}
      </div>
      <details className="exact-budget">
        <summary>مبلغ دلخواه</summary>
        <div className="two-fields">
          <label className="field">
            حداقل قیمت (تومان)
            <input
              type="text"
              inputMode="numeric"
              value={value.min ? money(Number(value.min)) : ""}
              onChange={(e) => onChange({ min: parseAmount(e.target.value) })}
            />
          </label>
          <label className="field">
            حداکثر قیمت (تومان)
            <input
              type="text"
              inputMode="numeric"
              value={value.max ? money(Number(value.max)) : ""}
              onChange={(e) => onChange({ max: parseAmount(e.target.value) })}
            />
          </label>
        </div>
      </details>
    </section>
  );
}
export function parseAmount(text: string) {
  return text
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[^0-9]/g, "");
}
