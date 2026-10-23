import { test, expect } from "./fixtures";
test("actual categories, budget, radius and payment controls share canonical filters", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /هنوز تصمیم نگرفتم/ }).click();
  await expect(page.locator(".category-grid button").first()).toBeVisible();
  const category = await page
    .locator(".category-grid button strong")
    .first()
    .innerText();
  await page.locator(".category-grid button").first().click();
  await expect(page.locator(".filter-chips")).toContainText(category);
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page.getByText("مبلغ دلخواه", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "حداکثر قیمت (تومان)" })
    .fill("10000000");
  await page.getByRole("button", { name: "۲ کیلومتر", exact: true }).click();
  await page.getByText("شرایط پرداخت و گارانتی", { exact: true }).click();
  await page.getByLabel("دارای توضیح گارانتی ثبت‌شده").check();
  const provider = page.getByRole("combobox", { name: "سرویس پرداخت ثبت‌شده" });
  await expect(provider.locator("option").nth(1)).toBeAttached();
  const value = await provider.locator("option").nth(1).getAttribute("value");
  await provider.selectOption(value!);
  await page.getByRole("button", { name: "نمایش نتایج", exact: true }).click();
  await expect(page.locator(".filter-chips")).toContainText("گارانتی");
  await expect(page.locator(".filter-chips")).toContainText("۱۰٬۰۰۰٬۰۰۰");
  await expect(page.locator(".filter-chips")).toContainText(value!);
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /شروع و خوش/ })
    .click();
  await expect(page.getByRole("heading", { name: /خرید خوب/ })).toBeVisible();
  await page.getByRole("button", { name: "سناریوهای نمایشی" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /گالری کامپوننت/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "اجزای یک تجربهٔ خرید" }),
  ).toBeVisible();
});
