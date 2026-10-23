import { test as base, expect } from "@playwright/test";
// Browser tests do not load the community routing server. Live routes are checked separately.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('hodhod-engine','demo'));
    await page.route("**/api/route?**", (r) => {
      const mode = new URL(r.request().url()).searchParams.get("mode");
      return r.fulfill({ json: { status: "unavailable", mode } });
    });
    await use(page);
  },
});
export { expect };
