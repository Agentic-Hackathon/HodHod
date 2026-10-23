import { test, expect } from './fixtures';

test('real backend conversation, clarification, source cards and reload', async ({ page }) => {
  const errors: string[]=[];
  page.on('pageerror', e => errors.push(e.message));
  const requests: string[]=[];
  page.on('request', r => {if(r.url().includes('/api/brain/dispatch/')) requests.push(r.postData() || '');});
  const initial=page.waitForResponse(r=>r.url().includes('/api/brain/dispatch/'));
  await page.goto('/?mode=brain');
  expect((await initial).ok()).toBeTruthy();
  const composer=page.getByRole('textbox',{name:'پیام به دستیار'}).first();
  await expect(composer).toBeVisible();
  await composer.fill('هدفون سونی میخوام');
  await expect(page.getByRole('button',{name:'ارسال پیام'}).first()).toBeEnabled();
  const replyPromise=page.waitForResponse(r => r.url().includes('/api/brain/dispatch/') && r.request().postDataJSON()?.action?.type==='message.send');
  await composer.press('Enter');
  const response=await replyPromise;
  expect(response.ok()).toBeTruthy();
  const reply=await response.json();
  expect(reply.results.products.length).toBeGreaterThan(0);
  expect(reply.results.products[0].id).toMatch(/^product_/);
  await expect(page.locator('.chat-message.assistant').last()).toContainText(reply.text);
  await expect(page.locator('.agent-clarification')).toBeVisible();
  await expect(page.getByRole('button',{name:'لغو درخواست'})).toHaveCount(0);
  await expect(page.locator('.product-card').first()).toBeVisible();
  const option=page.locator('.agent-clarification button').first();
  const clarified=page.waitForResponse(r=>r.url().includes('/api/brain/dispatch/')&&r.request().postDataJSON()?.action?.type==='agent.clarify');
  await option.click();
  expect((await clarified).ok()).toBeTruthy();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('گزینه');
  await expect(page.getByRole('button',{name:'لغو درخواست'})).toHaveCount(0);
  await expect(page.locator('.product-card').first()).toBeVisible();
  for(let step=0;step<3;step++) {
    const nextOption=page.locator('.agent-clarification button').first();
    if(!await nextOption.count())break;
    const nextReply=page.waitForResponse(r=>r.url().includes('/api/brain/dispatch/')&&r.request().postDataJSON()?.action?.type==='agent.clarify');
    await nextOption.click();
    expect((await nextReply).ok()).toBeTruthy();
    await expect(page.getByRole('button',{name:'لغو درخواست'})).toHaveCount(0);
    await expect(page.locator('.product-card').first()).toBeVisible();
  }
  await page.waitForTimeout(1200);
  expect(requests.filter(s=>JSON.parse(s).action.type==='message.send')).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.chat-message.user').first()).toContainText('هدفون سونی');
  expect(errors).toEqual([]);
});

test('mobile can chat next to the real shopping workspace', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?mode=brain');
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
