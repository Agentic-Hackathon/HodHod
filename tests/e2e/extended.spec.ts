import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
test("map real shops, list synchronization, pan search, graceful tile outage", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.route("https://demotiles.maplibre.org/**", (r) => r.abort());
  await page.goto("/showcase");
  await page.getByRole("button", { name: /اطراف من · شعاع/ }).click();
  await expect(page.locator(".map-store").first()).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.locator(".map-store").first().click();
  await expect(page.locator(".map-store.selected")).toHaveCount(1);
  await expect(page.locator(".map-store").first()).toBeVisible();
  const canvas = page.locator(".maplibregl-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, {
      steps: 15,
    });
    await page.mouse.up();
    await expect(
      page.getByRole("button", {
        name: "در این محدوده جست‌وجو کن",
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: "docs/screenshots/map-offline.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("all data-derived scenario families, unknown block states and inquiry", async ({
  page,
}) => {
  await page.goto("/showcase");
  await page.getByRole("button", { name: /مقایسهٔ دو کالا/ }).click();
  await expect(page.locator(".comparison-table thead th")).toHaveCount(3);
  for (const [name, selector] of [
    ["مقایسهٔ فروشندگان", ".seller-comparison"],
    ["نمودار قیمت و فاصله", ".decision-plot"],
    ["استعلام نمایشی", ".inquiry"],
  ] as const) {
    await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(name) })
      .click();
    await expect(page.locator(selector).first()).toBeVisible();
  }
  await expect(page.getByText("پیش‌نویس نمایشی · ارسال نشده")).toBeVisible();
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page.getByRole("button", { name: /بودجه و نیاز نامشخص/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page.getByRole("button", { name: /بدون نتیجه و اصلاح شروط/ }).click();
  await expect(
    page.getByRole("heading", { name: "در داده‌های ما نتیجه‌ای پیدا نشد" }),
  ).toBeVisible();
});
test("denied location, keyboard dialog, unsupported and supported speech", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (_ok: any, bad: any) => bad({ code: 1 }) },
    });
    Object.defineProperty(window, "SpeechRecognition", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /اطراف من چه خبره/ }).click();
  await page.getByRole("button", { name: "استفاده از موقعیت من" }).click();
  await expect(page.getByRole("alert")).toContainText("دسترسی");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "تایپ با صدا" }).click();
  await expect(page.getByRole("alert")).toContainText("پشتیبانی نمی‌شود");
  await page.evaluate(() => {
    class TestRecognition {
      lang = "";
      interimResults = false;
      onresult: any;
      onend: any;
      onerror: any;
      start() {
        this.onresult({ results: [[{ transcript: "هدفون آزمایش صوت" }]] });
        this.onend();
      }
      stop() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: TestRecognition,
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "تایپ با صدا" }).click();
  await expect(
    page.getByRole("textbox", { name: "پیام به دستیار" }),
  ).toHaveValue("هدفون آزمایش صوت");
});
test("offline preserves selected canvas, history rename/delete confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "پیام به دستیار" }).fill("هدفون");
  await page.getByRole("button", { name: "ارسال پیام" }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page
    .locator(".product-card")
    .first()
    .getByRole("button", { name: "ذخیرهٔ کالا" })
    .click();
  await page.waitForTimeout(400);
  await page.route("**/api/**", (r) => r.abort());
  await page.reload();
  await expect(
    page.getByText("آخرین داده‌های ذخیره‌شده؛ نتیجهٔ تازه دریافت نشده است."),
  ).toBeVisible();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.getByRole("button", { name: "تاریخچه", exact: true }).click();
  await page.getByRole("button", { name: "تغییر نام" }).first().click();
  await page.getByRole("textbox", { name: "نام خرید" }).fill("خرید هدفون من");
  await page.getByRole("button", { name: "ذخیرهٔ نام" }).click();
  await expect(page.locator(".session-card")).toContainText("خرید هدفون من");
  await page
    .locator(".session-card")
    .getByRole("button", { name: "حذف", exact: true })
    .click();
  await page.getByRole("button", { name: "انصراف" }).click();
  await expect(page.locator(".session-card")).toHaveCount(1);
});
test("dark and mobile accessibility, landscape layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await page.waitForTimeout(300);
  const a = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    a.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/landscape-dark.png",
    fullPage: true,
  });
});
