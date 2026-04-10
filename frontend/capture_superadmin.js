const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://nania-ssimdang.pages.dev';
const OUT = 'C:/Windows/Temp/screenshots';

const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();

  for (const scenario of [
    { name: 'superadmin_dark', role: 'super', theme: 'dark' },
    { name: 'superadmin_light', role: 'super', theme: 'light' },
    { name: 'normal_user', role: null, theme: 'dark' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ role, theme }) => {
      if (role) localStorage.setItem('admin_role', role);
      else localStorage.removeItem('admin_role');
      localStorage.setItem('theme', theme);
    }, scenario);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    // 히어로 아래 컨텐츠 영역이 보이도록 스크롤
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `content_${scenario.name}.png`), fullPage: false });
    console.log('saved:', scenario.name);

    await context.close();
  }

  await browser.close();
  console.log('done');
})();
