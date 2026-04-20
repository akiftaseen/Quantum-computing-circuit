import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import PptxGenJS from 'pptxgenjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const htmlPath = path.join(repoRoot, 'slides', 'slides.html');
const outputPath = path.join(repoRoot, 'slides', 'Quantum-Circuit-Simulator-Slides.pptx');

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = load(html);

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
pptx.author = 'Quantum Circuit Simulator Team';
pptx.company = 'Quantum Circuit Simulator';
pptx.subject = 'Presentation deck generated from slides.html';
pptx.title = 'Quantum Circuit Simulator Presentation';
pptx.lang = 'en-US';
pptx.theme = {
  headFontFace: 'Plus Jakarta Sans',
  bodyFontFace: 'Plus Jakarta Sans',
  lang: 'en-US'
};

const color = {
  bg: 'F7FBFF',
  panel: 'FFFFFF',
  border: 'D7E0EA',
  primary: '0F4C81',
  text: '0F172A',
  text2: '334155',
  chipBg: 'E8F2FA'
};

function decodeImagePath(src) {
  const cleaned = src.replace(/^\.\//, '');
  const decoded = decodeURIComponent(cleaned);
  return path.resolve(path.dirname(htmlPath), decoded);
}

function flattenLeftContent($main) {
  const lines = [];

  const addBulletList = ($list) => {
    $list.find('li').each((_, li) => {
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (text) lines.push(`• ${text}`);
    });
  };

  $main.find('.media-left article.card').each((_, card) => {
    const $card = $(card);
    const title = $card.find('.card-title').first().text().replace(/\s+/g, ' ').trim();
    if (title) lines.push(`${title}:`);
    $card.find('li').each((__, li) => {
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (text) lines.push(`• ${text}`);
    });
  });

  if (!lines.length) {
    $main.find('.media-left ul, .media-left ol').each((_, list) => addBulletList($(list)));
  }

  if (!lines.length) {
    $main.find('article.card').each((_, card) => {
      const $card = $(card);
      const title = $card.find('.card-title').first().text().replace(/\s+/g, ' ').trim();
      if (title) lines.push(`${title}:`);
      $card.find('li').each((__, li) => {
        const text = $(li).text().replace(/\s+/g, ' ').trim();
        if (text) lines.push(`• ${text}`);
      });
    });
  }

  if (!lines.length) {
    $main.find('ul.bullets li, ol.demo-steps li').each((_, li) => {
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (text) lines.push(`• ${text}`);
    });
  }

  if (!lines.length) {
    $main.find('li').each((_, li) => {
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (text) lines.push(`• ${text}`);
    });
  }

  return lines;
}

function addHeader(slide, sectionText, titleText, indexText) {
  slide.background = { color: color.bg };

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.3,
    y: 0.2,
    w: 12.73,
    h: 7.1,
    line: { color: color.border, pt: 1 },
    radius: 0.12,
    fill: { color: color.panel }
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.55,
    y: 0.38,
    w: 2.1,
    h: 0.38,
    radius: 0.18,
    line: { color: 'AFC6DC', pt: 1 },
    fill: { color: color.chipBg }
  });

  slide.addText(sectionText, {
    x: 0.64,
    y: 0.47,
    w: 1.92,
    h: 0.18,
    fontFace: 'JetBrains Mono',
    fontSize: 10,
    bold: true,
    color: color.primary,
    align: 'center'
  });

  slide.addText(titleText, {
    x: 0.55,
    y: 0.83,
    w: 10.9,
    h: 0.55,
    fontFace: 'Plus Jakarta Sans',
    fontSize: 30,
    bold: true,
    color: color.text
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 11.5,
    y: 0.42,
    w: 1.25,
    h: 0.34,
    radius: 0.16,
    line: { color: 'AFC6DC', pt: 1 },
    fill: { color: color.chipBg }
  });

  slide.addText(indexText, {
    x: 11.56,
    y: 0.50,
    w: 1.1,
    h: 0.18,
    fontFace: 'JetBrains Mono',
    fontSize: 9,
    bold: true,
    color: color.primary,
    align: 'center'
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 1.35,
    w: 12.05,
    h: 0,
    line: { color: color.border, pt: 1 }
  });
}

function addMain(slide, $main) {
  const imagePaths = [];
  $main.find('img').each((_, img) => {
    const src = $(img).attr('src');
    if (!src) return;
    const resolved = decodeImagePath(src);
    if (fs.existsSync(resolved) && !imagePaths.includes(resolved)) {
      imagePaths.push(resolved);
    }
  });

  const lines = flattenLeftContent($main);
  const leftIsDense = lines.length > 8;

  let textFont = 16;
  if (leftIsDense) textFont = 13;
  else if (lines.length > 6) textFont = 14;

  const leftX = 0.65;
  const leftY = 1.55;
  const leftW = imagePaths.length ? 4.85 : 11.85;
  const leftH = 5.45;

  if (lines.length) {
    slide.addText(lines.join('\n'), {
      x: leftX,
      y: leftY,
      w: leftW,
      h: leftH,
      fontFace: 'Plus Jakarta Sans',
      fontSize: textFont,
      color: color.text2,
      valign: 'mid',
      breakLine: true,
      margin: 0.03,
      fit: 'shrink'
    });
  }

  if (!imagePaths.length) return;

  const rightX = 5.75;
  const rightY = 1.52;
  const rightW = 6.75;
  const rightH = 5.5;

  if (imagePaths.length === 1) {
    slide.addImage({ path: imagePaths[0], x: rightX, y: rightY, w: rightW, h: rightH, sizing: { type: 'contain', x: rightX, y: rightY, w: rightW, h: rightH } });
    return;
  }

  if (imagePaths.length === 2) {
    const gap = 0.14;
    const halfH = (rightH - gap) / 2;
    slide.addImage({ path: imagePaths[0], x: rightX, y: rightY, w: rightW, h: halfH, sizing: { type: 'contain', x: rightX, y: rightY, w: rightW, h: halfH } });
    slide.addImage({ path: imagePaths[1], x: rightX, y: rightY + halfH + gap, w: rightW, h: halfH, sizing: { type: 'contain', x: rightX, y: rightY + halfH + gap, w: rightW, h: halfH } });
    return;
  }

  // 3+ images: 2x2 collage with first four.
  const gap = 0.14;
  const cellW = (rightW - gap) / 2;
  const cellH = (rightH - gap) / 2;
  imagePaths.slice(0, 4).forEach((imgPath, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = rightX + col * (cellW + gap);
    const y = rightY + row * (cellH + gap);
    slide.addImage({ path: imgPath, x, y, w: cellW, h: cellH, sizing: { type: 'contain', x, y, w: cellW, h: cellH } });
  });
}

$('.slide').each((_, slideEl) => {
  const $slide = $(slideEl);
  const sectionText = $slide.find('.section-chip').first().text().replace(/\s+/g, ' ').trim();
  const titleText = $slide.find('.slide-title').first().text().replace(/\s+/g, ' ').trim();
  const indexText = $slide.find('.slide-index').first().text().replace(/\s+/g, ' ').trim();
  const $main = $slide.find('main.content').first();

  const slide = pptx.addSlide();
  addHeader(slide, sectionText, titleText, indexText);
  addMain(slide, $main);
});

await pptx.writeFile({ fileName: outputPath });
console.log(`PPTX generated: ${outputPath}`);
