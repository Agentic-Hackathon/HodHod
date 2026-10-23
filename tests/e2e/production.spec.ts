import { test, expect } from "./fixtures";
test("production shell and session survive a full offline reload", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.TOROB_PRODUCTION_URL,
    "Set TOROB_PRODUCTION_URL to a running production preview to test the service worker.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TOROB_PRODUCTION_URL!);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.getByRole("textbox", { name: "پیام به دستیار" }).fill("هدفون");
  await page.getByRole("button", { name: "ارسال پیام" }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.waitForTimeout(600);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("آفلاین", { exact: true })).toBeVisible();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/production-offline.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
