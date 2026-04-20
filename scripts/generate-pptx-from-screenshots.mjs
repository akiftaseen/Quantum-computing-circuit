import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import PptxGenJS from 'pptxgenjs';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const slidesHtmlPath = path.join(repoRoot, 'slides', 'slides-pptx.html');
const screenshotsDir = path.join(repoRoot, 'slides', 'pptx-screenshots');
const outputPath = path.join(repoRoot, 'slides', 'Quantum-Circuit-Simulator-Slides.pptx');

const slideSelectors = Array.from({ length: 14 }, (_, index) => `#slide${index + 1}`);

fs.mkdirSync(screenshotsDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  colorScheme: 'light'
});

await page.goto(pathToFileURL(slidesHtmlPath).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
await page.waitForTimeout(400);

const screenshotPaths = [];
for (let i = 0; i < slideSelectors.length; i += 1) {
  const selector = slideSelectors[i];
  const slide = page.locator(selector);
  await slide.scrollIntoViewIfNeeded();
  const screenshotPath = path.join(screenshotsDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await slide.screenshot({ path: screenshotPath });
  screenshotPaths.push(screenshotPath);
}

await browser.close();

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Quantum Circuit Simulator Team';
pptx.company = 'Quantum Circuit Simulator';
pptx.subject = 'Screenshot-based presentation deck';
pptx.title = 'Quantum Circuit Simulator Presentation (Screenshot Version)';
pptx.lang = 'en-US';
pptx.theme = {
  headFontFace: 'Plus Jakarta Sans',
  bodyFontFace: 'Plus Jakarta Sans',
  lang: 'en-US'
};
pptx.defineLayout({ name: 'CUSTOM', width: 13.333, height: 7.5 });
pptx.layout = 'CUSTOM';

for (const imagePath of screenshotPaths) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addImage({ path: imagePath, x: 0, y: 0, w: 13.333, h: 7.5 });
}

await pptx.writeFile({ fileName: outputPath });
fs.rmSync(screenshotsDir, { recursive: true, force: true });
console.log(`Screenshot PPTX generated: ${outputPath}`);
