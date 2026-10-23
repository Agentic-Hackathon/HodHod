import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
test("desktop real data journey, compare, visit and persistence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /خرید خوب/ })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/desktop-welcome.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page.getByRole("button", { name: /کالای واقعی و چند فروشنده/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".offer-card").first()).toBeVisible();
  expect(await page.locator(".offer-card").count()).toBeGreaterThan(1);
  await page.screenshot({
    path: "docs/screenshots/product-offers.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "مقایسهٔ کالا", exact: true }).click();
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: "مقایسه کن" }).click();
  await expect(page.locator(".comparison-table")).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator(".comparison-table")).toBeVisible();
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page.getByRole("button", { name: /برنامهٔ مراجعه/ }).click();
  await expect(
    page.getByRole("heading", { name: "برنامهٔ خرید شما" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ذخیرهٔ برنامهٔ مراجعه", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "به‌روزرسانی برنامهٔ ذخیره‌شده" }),
  ).toBeVisible();
});
test("responsive sizes, themes and no horizontal overflow", async ({
  page,
}) => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /خرید خوب/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/welcome-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "docs/screenshots/desktop-dark.png",
    fullPage: true,
  });
});
test("mobile search, filters, empty state and image fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "گفت‌وگو", exact: true }).click();
  await page.getByRole("textbox", { name: "پیام به دستیار" }).fill("هدفون");
  await page.getByRole("button", { name: "ارسال پیام" }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/mobile-results.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page.getByText("مبلغ دلخواه", { exact: true }).click();
  await page.getByRole("textbox", { name: "حداکثر قیمت (تومان)" }).fill("1");
  await page.getByRole("button", { name: "نمایش نتایج", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "در داده‌های ما نتیجه‌ای پیدا نشد" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "حذف فیلترها و جست‌وجوی دوباره" })
    .click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.getByRole("button", { name: "گفت‌وگو", exact: true }).click();
  await page
    .locator('input[accept="image/png,image/jpeg,image/webp"]')
    .first()
    .setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXcAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.getByText(/تشخیص تصویری در حالت آزمایشی فعال نیست/)).toBeVisible();
  await page.getByRole("button", { name: "حذف تصویر" }).click();
  await expect(page.locator(".attachment-preview")).toHaveCount(0);
});
test("permission denial, remote failure, gallery and basic accessibility", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /اطراف من چه خبره/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "جمهوری", exact: true }).click();
  await expect(page.locator(".filter-chips")).toContainText("جمهوری");
  await page.getByRole("button", { name: "راهنما", exact: true }).click();
  await page.getByRole("combobox").selectOption("remote");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: "نتایج", exact: true }).click();
  await expect(page.getByText(/نشانی سرویس دستیار تنظیم نشده/)).toBeVisible();
  await page.getByRole("button", { name: "بازگشت به حالت نمایشی" }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.goto("/gallery");
  await expect(
    page.getByRole("heading", { name: "اجزای یک تجربهٔ خرید" }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "حالت‌های سیستم" }).click();
  await expect(page.getByText(/این بخش در نسخهٔ فعلی/)).toBeVisible();
  await page.goto("/");
  const a = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    a.violations.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
