import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

async function routeReplies(page: import("@playwright/test").Page) {
  await page.route("**/api/route?**", (r) => {
    const mode = new URL(r.request().url()).searchParams.get("mode");
    return r.fulfill({
      json: {
        status: "ready",
        mode,
        distanceMeters: mode === "walking" ? 900 : 1200,
        durationSeconds: mode === "walking" ? 600 : 180,
        calculatedAt: Date.now() / 1000,
        source: "test-only routing response",
        liveTraffic: false,
        geometry: {
          type: "LineString",
          coordinates: [
            [51.4107, 35.6953],
            [51.415, 35.7],
          ],
        },
        steps: [],
      },
    });
  });
}
test("late-night shopping uses real source offers, replans after failure and remembers the purchase", async ({
  page,
}) => {
  await routeReplies(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/showcase");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /خرید آخر شب/ })
    .click();
  await page.locator(".mission-editor > summary").click();
  await page.getByLabel("زمان حرکت خرید فوری").fill("2026-10-23T23:30");
  await page
    .getByRole("button", { name: "پیشنهاد مراجعه را پیدا کن", exact: true })
    .click();
  const card = page.locator(".mission-recommendation");
  await expect(page.locator(".mission-recommendation.ready")).toBeVisible();
  await expect(card).toContainText("فرصت مناسب برای مراجعه");
  await expect(page.locator(".mission-backup")).toBeVisible();
  const firstId = await card.getAttribute("data-offer-id");
  const source = await page.request.get(
    "/api/entities?kind=offers&ids=" + firstId,
  );
  const original = (await source.json())[0];
  expect(original.inventoryVerified).toBe(false);
  const productSource = await page.request.get(
    "/api/entities?kind=products&ids=" + original.productId,
  );
  expect((await productSource.json())[0].category).toBe("شارژر گوشی");
  await card
    .getByRole("button", { name: "موجودی را تأیید کردم", exact: true })
    .click();
  await expect(page.locator(".mission-reports")).toContainText("گزارش شما");
  const rejectedShop = original.shopId;
  const replan = page.waitForResponse(
    (r) =>
      r.url().includes("/api/mission?") &&
      r.url().includes("excludeShops=" + rejectedShop),
  );
  await card.getByRole("button", { name: "بسته بود", exact: true }).click();
  const nextData = await (await replan).json();
  expect(nextData.entries.every((e: any) => e.shop.id !== rejectedShop)).toBe(
    true,
  );
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute("data-offer-id", firstId!);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/hodhod-urgent-decision.png",
  });
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    report.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/hodhod-urgent-mobile.png" });
  await card
    .getByRole("button", { name: "برنامهٔ رفتن به این فروشگاه", exact: true })
    .click();
  await expect(page.locator(".visit-summary")).toBeVisible();
  await page
    .locator(".purchase-outcome")
    .getByRole("button", { name: "موجود نبود", exact: true })
    .click();
  await expect(page.locator(".shopping-mission")).toBeVisible();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "خریدم", exact: true }).click();
  await expect(page.locator(".mission-complete")).toContainText(
    "خریدت انجام شد",
  );
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator(".mission-complete")).toContainText(
    "خریدت انجام شد",
  );
  await expect(page.locator(".mission-reports")).toContainText("موجود نبود");
});

test("urgent chat extracts time, location selection stays in the flow and exploratory POIs remain separate", async ({
  page,
}) => {
  await routeReplies(page);
  await page.route("**/api/explore?**", (r) =>
    r.fulfill({
      json: {
        status: "ready",
        source: "OpenStreetMap",
        fetchedAt: Date.now() / 1000,
        places: [
          {
            id: "osm-node-123",
            name: "نقطهٔ تست اکتشافی",
            lat: 35.696,
            lon: 51.412,
            kind: "electronics",
            openingHours: null,
            sourceUrl: "https://www.openstreetmap.org/node/123",
            inventory: "unknown",
            membership: "unknown",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "پیام به دستیار" })
    .fill("ساعت ۱۱:۳۰ شب شارژر لازم دارم؛ فوری");
  await page.getByRole("button", { name: "ارسال پیام", exact: true }).click();
  await expect(page.getByLabel("نیاز خرید فوری")).toHaveValue("شارژر");
  await expect(page.getByLabel("زمان حرکت خرید فوری")).toHaveValue(/T23:30$/);
  await page.getByLabel("کاربرد شارژر").selectOption("شارژر گوشی");
  await page
    .getByRole("button", { name: "پیشنهاد مراجعه را پیدا کن", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "جمهوری", exact: true })
    .click();
  await expect(page.locator(".shopping-mission")).toBeVisible();
  await expect(page.locator(".mission-recommendation")).toBeVisible();
  await page.getByRole("button", { name: "پیاده", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "پیاده", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "لوازم الکترونیکی اطراف", exact: true })
    .click();
  await expect(page.locator(".exploration-places")).toContainText(
    "موجودی نامشخص",
  );
  await expect(page.locator(".exploration-places")).not.toContainText("تومان");
  await page
    .locator(".exploration-places")
    .getByRole("button", { name: "روی نقشه", exact: true })
    .click();
  await expect(page.locator(".mission-geography")).toContainText(
    "نقاط عمومی برای بررسی حضوری",
  );
  await expect(page.locator(".mission-geography .context-shop")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "بازگشت به فروشگاه‌های دارای آفر",
      exact: true,
    })
    .click();
  await expect(page.locator(".mission-geography")).toContainText(
    "گزینه‌های خرید",
  );
  await page.route("**/api/explore?**", (r) =>
    r.fulfill({
      json: {
        status: "unavailable",
        source: "OpenStreetMap",
        places: [],
        fetchedAt: Date.now() / 1000,
      },
    }),
  );
  await page
    .getByRole("button", { name: "مراکز خرید اطراف", exact: true })
    .click();
  await expect(page.locator(".mission-exploration")).toContainText(
    "در دسترس نیست",
  );
});
