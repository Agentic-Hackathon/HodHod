import type { Shop } from "../../data/types";
const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
export function tehranInput(date = new Date()) {
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function fromTehranInput(value: string) {
  const guess = new Date(value + "Z");
  if (Number.isNaN(guess.getTime())) return null;
  const p = localParts(guess);
  const adjusted = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
  return new Date(guess.getTime() - (adjusted - guess.getTime()));
}
function minutes(v: string) {
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h) &&
    Number.isFinite(m) &&
    h >= 0 &&
    h < 24 &&
    m >= 0 &&
    m < 60
    ? h * 60 + m
    : null;
}
export function scheduleAt(
  shop: Shop,
  date: Date,
): "open" | "closed" | "unknown" {
  const p = localParts(date),
    day = p.weekday.toLowerCase(),
    now = Number(p.hour) * 60 + Number(p.minute);
  const today = shop.hours[day];
  const prev = shop.hours[days[(days.indexOf(day) + 6) % 7]];
  for (const shift of prev?.status === "declared" ? prev.shifts : []) {
    const a = minutes(shift.start_time),
      b = minutes(shift.end_time);
    if (a !== null && b !== null && b < a && now < b) return "open";
  }
  if (!today || !["declared", "closed"].includes(today.status))
    return "unknown";
  if (today.status === "closed") return "closed";
  let valid = false;
  for (const shift of today.shifts || []) {
    const a = minutes(shift.start_time),
      b = minutes(shift.end_time);
    if (a === null || b === null || a === b) continue;
    valid = true;
    if (b > a ? now >= a && now < b : now >= a) return "open";
  }
  return valid ? "closed" : "unknown";
}
export function nextOpening(shop: Shop, date: Date) {
  const p = localParts(date);
  const index = days.indexOf(p.weekday.toLowerCase());
  const now = Number(p.hour) * 60 + Number(p.minute);
  for (let offset = 0; offset <= 7; offset++) {
    const schedule = shop.hours[days[(index + offset) % 7]];
    if (schedule?.status !== "declared") continue;
    const starts = schedule.shifts
      .filter((s) => s.start_time !== s.end_time)
      .map((s) => minutes(s.start_time))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const start = starts.find((m) => offset > 0 || m > now);
    if (start !== undefined) {
      const day = new Intl.DateTimeFormat("fa-IR", {
        timeZone: "Asia/Tehran",
        weekday: "long",
      }).format(new Date(date.getTime() + offset * 86400000));
      return `${day}، ${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    }
  }
  return null;
}
