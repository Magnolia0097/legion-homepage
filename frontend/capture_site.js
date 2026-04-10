const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://nania-ssimdang.pages.dev';
const OUT = 'C:/Windows/Temp/screenshots';

const pages = [
  { name: 'main', path: '/' },
  { name: 'notices', path: '/notices' },
  { name: 'events', path: '/events' },
  { name: 'gallery', path: '/gallery' },
];

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === 'mobile' ? 2 : 1,
    });
    const page = await context.newPage();

    for (const pg of pages) {
      try {
        await page.goto(BASE + pg.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3500);
        const file = path.join(OUT, `${pg.name}_${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log('saved:', file);
      } catch (e) {
        console.error('failed:', pg.name, vp.name, e.message);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log('done');
})();
