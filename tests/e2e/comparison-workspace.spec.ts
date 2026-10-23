import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("price status filters the complete dataset and survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "نتایج", exact: true }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page
    .getByRole("button", { name: "فقط قیمت نامشخص", exact: true })
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/search?") &&
      r.url().includes("priceStatus=unknown"),
  );
  await page.getByRole("button", { name: "نمایش نتایج", exact: true }).click();
  const data = await (await response).json();
  expect(data.total).toBeGreaterThan(12);
  expect(
    data.offers.every((o: { price: number | null }) => o.price === null),
  ).toBe(true);
  await expect(page.locator(".filter-chips")).toContainText("فقط قیمت نامشخص");
  await expect(page.locator(".product-card").first()).toContainText(
    "قیمت نامشخص",
  );
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator(".filter-chips")).toContainText("فقط قیمت نامشخص");
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page.getByRole("button", { name: "فقط قیمت‌دار", exact: true }).click();
  const known = page.waitForResponse(
    (r) =>
      r.url().includes("/api/search?") && r.url().includes("priceStatus=known"),
  );
  await page.getByRole("button", { name: "نمایش نتایج", exact: true }).click();
  expect(
    (await (await known).json()).offers.every(
      (o: { price: number | null }) => o.price !== null,
    ),
  ).toBe(true);
  await expect(
    page.locator(".product-card").filter({ hasText: "قیمت نامشخص" }),
  ).toHaveCount(0);
});

test("radius is shown geographically around the origin in filters and main map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/showcase");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /اطراف من · شعاع/ })
    .click();
  await expect(page.locator(".map-store").first()).toBeVisible();
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await expect(page.locator(".radius-picker .context-user")).toContainText(
    "شما",
  );
  await expect(page.locator(".radius-picker .context-map")).toHaveAttribute(
    "data-radius-km",
    "1",
  );
  await page.getByRole("button", { name: "۲ کیلومتر", exact: true }).click();
  await expect(page.locator(".radius-picker .context-map")).toHaveAttribute(
    "data-radius-km",
    "2",
  );
  await page.locator(".radius-picker").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/hodhod-radius-geographic.png",
  });
});

test("one comparison includes features, matching shop map and Pareto; tray identifies selections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/showcase");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /مقایسهٔ دو کالا/ })
    .click();
  await expect(page.locator(".compare-selection")).toHaveCount(2);
  const titles = await page
    .locator(".compare-selection > span")
    .allTextContents();
  expect(titles.every(Boolean)).toBe(true);
  for (const title of titles)
    await expect(page.locator(".comparison-table")).toContainText(title);
  await expect(
    page.getByRole("button", { name: "تصمیم‌یار", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".interactive-pareto")).toBeVisible();
  await expect(
    page.locator(".comparison-geography .context-user"),
  ).toContainText("شما");
  const markers = page.locator(".comparison-geography .context-shop");
  expect(await markers.count()).toBeGreaterThan(0);
  expect(await markers.count()).toBeLessThanOrEqual(
    await page.locator(".comparison-store").count(),
  );
  await page.locator("#comparison-geography").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/hodhod-comparison-map.png" });
  await markers.first().click();
  const picker = page.getByRole("group", { name: "فروشگاه‌های این محدوده" });
  if (await picker.isVisible())
    await picker.locator(":scope > button").first().click();
  await expect(page.locator(".comparison-store.selected")).toHaveCount(1);
  await expect(page.locator(".travel-planner")).toBeVisible();
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
    const tray = await page.locator(".compare-tray").boundingBox();
    const canvas = await page.locator(".canvas").boundingBox();
    expect(tray!.y).toBeGreaterThanOrEqual(canvas!.y + canvas!.height - 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/hodhod-comparison-mobile.png",
  });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "نقشه", exact: true })
    .click();
  await expect(page.locator(".map-layout")).toBeVisible();
  await page.getByRole("button", { name: "مقایسه کن", exact: true }).click();
  await expect(page.locator(".comparison-workspace")).toBeVisible();
  const remove = page.locator(".compare-selection").first().getByRole("button");
  await expect(remove).toHaveAttribute("aria-label", "حذف " + titles[0]);
  await remove.click();
  await expect(page.locator(".compare-selection")).toHaveCount(1);
});
