import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH || (process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
const base=process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:5173';
await mkdir('docs/screenshots',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const initial=page.waitForResponse(r=>r.url().includes('/api/brain/dispatch/'));
  await page.goto(base+'/?mode=brain');
  await initial;
  await page.getByRole('textbox',{name:'پیام به دستیار'}).fill('هدفون سونی میخوام');
  const reply=page.waitForResponse(r=>r.url().includes('/api/brain/dispatch/')&&r.request().postDataJSON()?.action?.type==='message.send');
  await page.getByRole('button',{name:'ارسال پیام'}).click();
  if(!(await reply).ok())throw new Error('Agent screenshot request failed.');
  await page.locator('.product-card').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>Promise.race([
    Promise.allSettled(Array.from(document.querySelectorAll('.product-photo img')).slice(0,4).map(img=>img.decode())),
    new Promise(resolve=>setTimeout(resolve,15000))
  ]));
  await page.screenshot({path:'docs/screenshots/hodhod-connected-desktop.png'});
  for(let step=0;step<3;step++) {
    const option=page.locator('.agent-clarification button').first();
    if(!await option.count())break;
    const clarified=page.waitForResponse(r=>r.url().includes('/api/brain/dispatch/')&&r.request().postDataJSON()?.action?.type==='agent.clarify');
    await option.click();
    if(!(await clarified).ok())throw new Error('Clarification failed.');
    await page.locator('.product-card').first().waitFor();
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'چت در همین صفحه',exact:true}).click();
  await page.getByRole('textbox',{name:'پیام به دستیار'}).waitFor();
  await page.locator('.product-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/screenshots/hodhod-connected-mobile.png'});
  console.log('Captured connected desktop and mobile from the running application.');
} finally {await browser.close();}
