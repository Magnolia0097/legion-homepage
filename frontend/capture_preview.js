const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://nania-ssimdang.pages.dev';
const OUT = 'C:/Windows/Temp/screenshots';

const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const COMBOS = [
  { tab: 'current', mode: 'dark',  tabIdx: 0, modeIdx: 0 },
  { tab: 'current', mode: 'light', tabIdx: 0, modeIdx: 1 },
  { tab: 'a',       mode: 'dark',  tabIdx: 1, modeIdx: 0 },
  { tab: 'a',       mode: 'light', tabIdx: 1, modeIdx: 1 },
  { tab: 'b',       mode: 'dark',  tabIdx: 2, modeIdx: 0 },
  { tab: 'b',       mode: 'light', tabIdx: 2, modeIdx: 1 },
];

(async () => {
  const browser = await chromium.launch();

  for (const vp of [
    { name: 'mobile', width: 390, height: 844, scale: 2 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
    });
    const page = await context.newPage();

    // localStorage 주입
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem('admin_role', 'super');
    });

    for (const combo of COMBOS) {
      try {
        await page.goto(`${BASE}/design-preview`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1800);

        // 모드 버튼 클릭 (🌙 다크 / ☀️ 라이트)
        await page.evaluate((modeIdx) => {
          const btns = Array.from(document.querySelectorAll('button')).filter(b =>
            b.textContent && (b.textContent.includes('다크') || b.textContent.includes('라이트'))
          );
          if (btns[modeIdx]) btns[modeIdx].click();
        }, combo.modeIdx);
        await page.waitForTimeout(400);

        // 테마 탭 클릭
        await page.evaluate((tabIdx) => {
          const btns = Array.from(document.querySelectorAll('button')).filter(b =>
            b.textContent && (b.textContent.includes('현재') || b.textContent.includes('A안') || b.textContent.includes('B안'))
          );
          if (btns[tabIdx]) btns[tabIdx].click();
        }, combo.tabIdx);
        await page.waitForTimeout(600);

        const file = path.join(OUT, `preview_${combo.tab}_${combo.mode}_${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log('saved:', file);
      } catch (e) {
        console.error('failed:', combo.tab, combo.mode, e.message);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log('done');
})();
