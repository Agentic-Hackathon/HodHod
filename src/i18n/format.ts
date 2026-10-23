export const fa = (n: number) =>
  new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(n);
export const money = (n: number | null) =>
  n === null ? "قیمت نامشخص" : new Intl.NumberFormat("fa-IR").format(n);
export const date = (v: string | null) =>
  v && !Number.isNaN(new Date(v).getTime())
    ? new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeZone: "Asia/Tehran",
      }).format(new Date(v))
    : "زمان نامشخص";
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const r = Math.PI / 180;
  const x =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}
export const safeUrl = (v: string | null | undefined) => {
  try {
    const u = new URL(v || "");
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};
