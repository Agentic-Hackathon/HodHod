import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
test("visual filters, total pages, Hodhod identity and mobile inline chat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("هدهد");
  await expect(page.getByText("ترب همراه")).toHaveCount(0);
  await page.getByRole("button", { name: "هدفون", exact: true }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await expect(page.locator(".pagination")).toContainText("از");
  await expect(page.locator(".source-disclosure")).toHaveCount(0);
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page.getByRole("button", { name: /اقتصادی/ }).click();
  await page.getByRole("button", { name: "۲ کیلومتر", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "۲ کیلومتر", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "docs/screenshots/hodhod-filters.png" });
  await page.getByRole("button", { name: "نمایش نتایج", exact: true }).click();
  await expect(page.locator(".filter-chips")).toContainText("تا");
  await page
    .getByRole("button", { name: "چت در همین صفحه", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveClass(/dock-open/);
  await expect(
    page.getByRole("textbox", { name: "پیام به دستیار" }),
  ).toBeVisible();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.getByRole("textbox", { name: "پیام به دستیار" }).fill("سونی");
  await page.getByRole("button", { name: "ارسال پیام" }).click();
  await expect(page.locator(".chat-message.user").last()).toContainText("سونی");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/hodhod-mobile-chat.png" });
});
test("Pareto points identify exact product+seller; comparison never silently mixes products", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/showcase");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /نمودار قیمت و فاصله/ })
    .click();
  await expect(page.locator(".interactive-pareto")).toBeVisible();
  const points = page.locator(".interactive-pareto svg g[role=button]");
  expect(await points.count()).toBeGreaterThan(1);
  await points.last().click();
  await expect(page.locator(".selected-candidate")).toBeVisible();
  await expect(points.last()).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "docs/screenshots/hodhod-pareto.png" });
  await points.first().focus();
  await page.keyboard.press("Tab");
  await expect(points.nth(1)).toBeFocused();
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /مقایسهٔ دو کالا/ })
    .click();
  await expect(page.locator(".rich-comparison")).toBeVisible();
  await page.getByRole("button", { name: "فقط تفاوت‌ها", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "فقط تفاوت‌ها", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "docs/screenshots/hodhod-comparison.png" });
});
test("visit computes both modes, maps chosen route, quantities and arrival status", async ({
  page,
}) => {
  await page.route("**/api/route?**", async (r) => {
    const mode = new URL(r.request().url()).searchParams.get("mode");
    await r.fulfill({
      json: {
        status: "ready",
        mode,
        geometry: {
          type: "LineString",
          coordinates: [
            [51.4107, 35.6953],
            [51.412, 35.696],
            [51.415, 35.7],
          ],
        },
        distanceMeters: mode === "driving" ? 1800 : 1100,
        durationSeconds: mode === "driving" ? 180 : 900,
        liveTraffic: false,
        source: "test-only mock OSRM",
        calculatedAt: 0,
        steps: [
          {
            name: "خیابان نمونهٔ تست",
            distance: 1100,
            type: "depart",
            modifier: "straight",
          },
          { name: "", distance: 0, type: "arrive", modifier: "" },
        ],
      },
    });
  });
  await page.goto("/showcase");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /برنامهٔ مراجعه/ })
    .click();
  await expect(page.locator(".travel-modes")).toContainText("۳ دقیقه");
  await expect(page.locator(".travel-modes")).toContainText("۱۵ دقیقه");
  await page.getByRole("button", { name: "افزایش تعداد" }).click();
  await expect(page.locator(".quantity-control")).toContainText("۲");
  await page.getByRole("button", { name: /پیاده.*۱۵ دقیقه/ }).click();
  await expect(
    page.getByRole("heading", { name: "راهنمای مسیر پیاده" }),
  ).toBeVisible();
  await expect(page.locator(".arrival-options>div")).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/hodhod-visit.png",
    fullPage: true,
  });
});
test("redesigned controls and chart remain accessible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "نتایج", exact: true }).click();
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await expect(page.getByRole("button", { name: /اقتصادی/ })).toBeEnabled();
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    report.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
});
test("seller comparison requires a single product and groups repeated shop offers", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "نتایج", exact: true }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.getByRole("button", { name: "مقایسه", exact: true }).click();
  await page
    .getByRole("button", { name: "مقایسهٔ فروشندگان یک کالا", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "فروشندگان کدام کالا را مقایسه کنیم؟" }),
  ).toBeVisible();
  await page.locator(".seller-product-options button").first().click();
  await expect(page.locator(".seller-product-heading")).toBeVisible();
  const names = await page.locator(".seller-group h3").allTextContents();
  expect(new Set(names).size).toBe(names.length);
});
