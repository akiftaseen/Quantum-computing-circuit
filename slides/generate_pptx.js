#!/usr/bin/env node
/**
 * generate_pptx.js
 * Generates a PPTX matching slides-pptx.html (14 slides, Quantum Circuit Simulator)
 *
 * ── Setup ───────────────────────────────────────────────────────────────────
 *   npm install pptxgenjs          (local install, recommended)
 *   node generate_pptx.js
 *
 *   OR global install:
 *   npm install -g pptxgenjs
 *   node generate_pptx.js
 *
 * ── Images ──────────────────────────────────────────────────────────────────
 *   Place all image files in the SAME directory as this script.
 *   Missing images are replaced with labelled placeholder boxes automatically.
 *
 *   Required:
 *     bloch spheres.png
 *     openqasm.png
 *     PH_01_APP_HERO_OVERVIEW.png
 *     PH_02_CORE_EDITOR_FLOW.png
 *     PH_03_ADVANCED_LAB_OVERVIEW.png
 *     PH_04_TEST_EVIDENCE_TERMINAL.png
 *     PH_05_APP_STRUCTURE_VIEW.png
 *     PH_06_EXECUTION_RESULTS_VIEW.png
 *     PH_07_BELL_IDEAL_RUN.png
 *     PH_08_NOISE_COMPARISON.png
 *     PH_09_SIMULATOR_LAB_WORKFLOW.png
 *     PH_10_EXPORT_OUTPUTS.png
 */

"use strict";
import pptxgen from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";

// ── Design tokens ────────────────────────────────────────────────────────────
const PRIMARY = "0F4C81";   // #0F4C81  primary blue
const PRIM_BG = "E8F2FA";   // light blue chip / badge bg
const BORDER  = "D7E0EA";   // card / separator border
const WHITE   = "FFFFFF";
const TEXT    = "0F172A";   // near-black heading
const TEXT2   = "334155";   // slate body
const SANS    = "Calibri";  // closest widely-available match to Plus Jakarta Sans
const MONO    = "Courier New"; // closest to JetBrains Mono

// ── Layout (inches, LAYOUT_16x9 = 10 × 5.625) ───────────────────────────────
const W = 10, H = 5.625;
const M = 0.38;             // outer margin
const GAP = 0.14;           // column gap

// Header geometry
const CHIP_H  = 0.26;
const CHIP_W  = 1.6;
const TITLE_H = 0.50;
const IDX_W   = 0.75;
const IDX_H   = 0.24;

const HDR_Y  = M;
const SEP_Y  = HDR_Y + CHIP_H + 0.04 + TITLE_H + 0.06;  // bottom of header
const CONT_Y = SEP_Y + 0.12;                              // top of content area
const CONT_W = W - M * 2;
const CONT_H = H - CONT_Y - 0.22;
const CONT_X = M;

// ── Column helpers ────────────────────────────────────────────────────────────
// narrow = true  → 36 / 64 split (slides 4, 7, 9, 10, 11, 14)
// narrow = false → 40 / 60 split (all other media slides)
function cols(narrow = false) {
  const lRatio = narrow ? 0.36 : 0.40;
  const lw = CONT_W * lRatio - GAP / 2;
  const rw = CONT_W * (1 - lRatio) - GAP / 2;
  const rx = CONT_X + lw + GAP;
  return { lx: CONT_X, lw, rx, rw };
}

// ── Reusable shadow factory (NEVER reuse the same object – pptxgenjs mutates it) ──
const mkShadow = () => ({ type: "outer", blur: 8, offset: 2, angle: 135, color: "0F172A", opacity: 0.09 });

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Adds the standard slide header: chip, title, index badge, separator line. */
function addHeader(pres, slide, section, title, index) {
  slide.background = { color: "FAFCFF" };

  // Section chip – centred horizontally
  const chipX = CONT_X + CONT_W / 2 - CHIP_W / 2;
  slide.addShape(pres.shapes.RECTANGLE, {
    x: chipX, y: HDR_Y, w: CHIP_W, h: CHIP_H,
    fill: { color: PRIM_BG }, line: { color: "A8C8E0", width: 0.75 }
  });
  slide.addText(section, {
    x: chipX, y: HDR_Y, w: CHIP_W, h: CHIP_H,
    fontSize: 8.5, fontFace: MONO, bold: true,
    color: PRIMARY, align: "center", valign: "middle", margin: 0
  });

  // Slide title – centred, below chip
  slide.addText(title, {
    x: CONT_X, y: HDR_Y + CHIP_H + 0.04, w: CONT_W, h: TITLE_H,
    fontSize: 26, fontFace: SANS, bold: true,
    color: TEXT, align: "center", valign: "top", margin: 0
  });

  // Index badge – top-right corner
  slide.addShape(pres.shapes.RECTANGLE, {
    x: W - M - IDX_W, y: HDR_Y, w: IDX_W, h: IDX_H,
    fill: { color: PRIM_BG }, line: { color: "A8C8E0", width: 0.75 }
  });
  slide.addText(index, {
    x: W - M - IDX_W, y: HDR_Y, w: IDX_W, h: IDX_H,
    fontSize: 8, fontFace: MONO, bold: true,
    color: PRIMARY, align: "center", valign: "middle", margin: 0
  });

  // Separator line
  slide.addShape(pres.shapes.LINE, {
    x: CONT_X, y: SEP_Y, w: CONT_W, h: 0,
    line: { color: BORDER, width: 0.75 }
  });
}

/**
 * Adds an image (or placeholder if the file is missing) plus an optional caption.
 * src is the raw HTML src attribute value (may be URL-encoded, e.g. ./bloch%20spheres.png)
 */
function addImg(pres, slide, src, x, y, w, h, caption) {
  const CAP_H = caption ? 0.18 : 0;
  const CAP_GAP = caption ? 0.04 : 0;
  const imgH = h - CAP_H - CAP_GAP;

  // Resolve the path (URL-decode and strip leading ./)
  const p = decodeURIComponent(src).replace(/^\.\//, "");

  if (fs.existsSync(p)) {
    slide.addImage({
      path: p,
      x, y, w, h: imgH,
      sizing: { type: "contain", w, h: imgH }
    });
  } else {
    // Placeholder box when image is missing
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h: imgH,
      fill: { color: "EEF4FA" }, line: { color: BORDER, width: 1 }
    });
    slide.addText("[ " + path.basename(p) + " ]", {
      x, y: y + imgH / 2 - 0.18, w, h: 0.36,
      fontSize: 8, color: "94A3B8", align: "center", valign: "middle"
    });
  }

  if (caption) {
    slide.addText(caption.toUpperCase(), {
      x, y: y + imgH + CAP_GAP, w, h: CAP_H,
      fontSize: 7, fontFace: MONO, color: TEXT2,
      align: "center", charSpacing: 0.5
    });
  }
}

/**
 * Adds a disc-bulleted list inside the given bounding box.
 * fontSize defaults to 13pt; use smaller values for tighter slides.
 */
function addBullets(slide, items, x, y, w, h, fontSize = 13) {
  const arr = items.map((text, i) => ({
    text,
    options: {
      bullet: true,
      breakLine: i < items.length - 1,
      fontSize,
      fontFace: SANS,
      color: TEXT2,
      paraSpaceAfter: 5
    }
  }));
  slide.addText(arr, { x, y, w, h, valign: "middle" });
}

/**
 * Adds a card (white rect with blue top accent, bold title, bullet list).
 * tight=true uses smaller font sizes for denser content.
 */
function addCard(pres, slide, cardTitle, items, x, y, w, h, tight = false) {
  // Card background + shadow
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: WHITE }, line: { color: BORDER, width: 0.75 }, shadow: mkShadow()
  });
  // Blue top accent bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.05,
    fill: { color: PRIMARY }, line: { color: PRIMARY, width: 0 }
  });
  // Card title
  slide.addText(cardTitle, {
    x: x + 0.12, y: y + 0.07, w: w - 0.24, h: 0.26,
    fontSize: tight ? 10 : 11.5, fontFace: SANS, bold: true,
    color: TEXT, valign: "top", margin: 0
  });
  // Card bullets
  const bfs = tight ? 8.5 : 10;
  const arr = items.map((text, i) => ({
    text,
    options: {
      bullet: true,
      breakLine: i < items.length - 1,
      fontSize: bfs,
      fontFace: SANS,
      color: TEXT2,
      paraSpaceAfter: tight ? 2 : 3
    }
  }));
  slide.addText(arr, {
    x: x + 0.12, y: y + 0.36, w: w - 0.24, h: h - 0.42,
    valign: "top"
  });
}

/** Adds a single KPI stat box (big number + label). */
function addKpi(pres, slide, value, label, x, y, w, h) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: WHITE }, line: { color: BORDER, width: 0.75 }, shadow: mkShadow()
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.045,
    fill: { color: PRIMARY }, line: { color: PRIMARY, width: 0 }
  });
  slide.addText(value, {
    x, y: y + 0.06, w, h: h * 0.55,
    fontSize: 22, fontFace: SANS, bold: true,
    color: PRIMARY, align: "center", valign: "middle", margin: 0
  });
  slide.addText(label, {
    x: x + 0.05, y: y + h * 0.6, w: w - 0.1, h: h * 0.36,
    fontSize: 8, fontFace: SANS, bold: true,
    color: TEXT2, align: "center", valign: "top", margin: 0
  });
}

/** Adds one numbered demo step row (step-number on left, text on right, blue left border). */
function addDemoStep(pres, slide, no, text, x, y, w, h) {
  // White card with shadow
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: WHITE }, line: { color: BORDER, width: 0.75 }, shadow: mkShadow()
  });
  // Blue left-border accent
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 0.055, h,
    fill: { color: PRIMARY }, line: { color: PRIMARY, width: 0 }
  });
  // Step number
  slide.addText(no, {
    x: x + 0.1, y, w: 0.38, h,
    fontSize: 9, fontFace: MONO, bold: true, color: PRIMARY,
    valign: "middle", margin: 0
  });
  // Step description
  slide.addText(text, {
    x: x + 0.46, y, w: w - 0.56, h,
    fontSize: 10, fontFace: SANS, color: TEXT2,
    valign: "middle", margin: 0
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD PRESENTATION
// ─────────────────────────────────────────────────────────────────────────────
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title  = "Quantum Circuit Simulator";
pres.author = "Generated from slides-pptx.html";

// ═══════════════════════════════════════════════════════════════════
// Slide 1 – Presentation Overview / Quantum Circuit Simulator
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "Presentation Overview", "Quantum Circuit Simulator", "01 / 12");
  const { lx, lw, rx, rw } = cols();
  addBullets(s, [
    "Background and motivation",
    "What was done this semester",
    "How it was implemented",
    "Live app demonstration"
  ], lx, CONT_Y, lw, CONT_H, 13);
  addImg(pres, s, "./bloch%20spheres.png", rx, CONT_Y, rw, CONT_H, "Bloch sphere visualization");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 2 – A. Background / Project Motivation
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "A. Background", "Project Motivation", "02 / 12");
  const { lx, lw, rx, rw } = cols();
  addBullets(s, [
    "Need a local quantum simulator for teaching and experimentation",
    "Many existing tools are either hard for beginners or too limited for deeper work",
    "Wanted one interface for visual learning and technical analysis",
    "Design target: no backend dependency, reproducible outputs, offline-ready"
  ], lx, CONT_Y, lw, CONT_H, 12);
  addImg(pres, s, "./PH_01_APP_HERO_OVERVIEW.png", rx, CONT_Y, rw, CONT_H, "Main application overview");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 3 – A. Background / Project Goals
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "A. Background", "Project Goals", "03 / 12");
  const { lx, lw, rx, rw } = cols();
  addBullets(s, [
    "Build circuits quickly with clear visual feedback",
    "Run ideal and noisy simulations in the browser",
    "Support export/import workflows for interoperability",
    "Keep the UI simple first, then reveal advanced tools progressively"
  ], lx, CONT_Y, lw, CONT_H, 12);
  addImg(pres, s, "./PH_03_ADVANCED_LAB_OVERVIEW.png", rx, CONT_Y, rw, CONT_H, "Advanced simulator lab overview");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 4 – B. What / What Was Implemented   (narrow split)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "B. What", "What Was Implemented", "04 / 12");
  const { lx, lw, rx, rw } = cols(true);
  const cardGap = 0.14;
  const cardH   = (CONT_H - cardGap) / 2;

  addCard(pres, s, "Core Functionality", [
    "Drag-and-drop circuit editor",
    "State-vector simulation",
    "Shots and histogram views",
    "Bloch and Dirac visualizations",
    "Step-by-step execution support"
  ], lx, CONT_Y, lw, cardH, true);

  addCard(pres, s, "Advanced Functionality", [
    "Noisy simulation with configurable channels",
    "Hardware compatibility and routing checks",
    "Optimization and sweep tools",
    "OpenQASM-lite import/export",
    "Experiment save/load and report export"
  ], lx, CONT_Y + cardH + cardGap, lw, cardH, true);

  addImg(pres, s, "./PH_02_CORE_EDITOR_FLOW.png", rx, CONT_Y, rw, CONT_H, "Core editor workflow");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 5 – B. What / Evidence of Completed Work   (KPI grid)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "B. What", "Evidence of Completed Work", "05 / 12");
  const { lx, lw, rx, rw } = cols(true);

  // 2×2 KPI grid
  const kpiGap = 0.12;
  const kpiW   = (lw - kpiGap) / 2;
  const kpiH   = 0.90;
  const kpis   = [
    { value: "15",  label: "Logic Test Files"       },
    { value: "104", label: "Logic Test Cases"       },
    { value: "37",  label: "Logic Modules"          },
    { value: "6",   label: "Max Qubits\n(Current Limit)" }
  ];
  kpis.forEach(({ value, label }, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    addKpi(pres, s, value, label,
      lx + col * (kpiW + kpiGap),
      CONT_Y + row * (kpiH + kpiGap),
      kpiW, kpiH
    );
  });

  // Two extra bullets below the KPI grid
  const bulletY = CONT_Y + kpiH * 2 + kpiGap * 2 + 0.10;
  addBullets(s, [
    "App state persistence, draft management, and theme persistence are implemented",
    "Simulator Lab includes calibration, mitigation, and optimization features"
  ], lx, bulletY, lw, CONT_H - (bulletY - CONT_Y), 9.5);

  addImg(pres, s, "./PH_04_TEST_EVIDENCE_TERMINAL.png", rx, CONT_Y, rw, CONT_H, "Terminal test evidence");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 6 – B. What / Scope and Honest Limits
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "B. What", "Scope and Honest Limits", "06 / 12");
  const { lx, lw, rx, rw } = cols();
  addBullets(s, [
    "Current simulator limit is 6 qubits for browser practicality",
    "OpenQASM support is intentionally a practical lite subset",
    "Routing uses heuristic SWAP insertion, not globally optimal routing",
    "Noise calibration uses a coarse 216-point parameter search"
  ], lx, CONT_Y, lw, CONT_H, 12);
  addImg(pres, s, "./openqasm.png", rx, CONT_Y, rw, CONT_H, "OpenQASM and report export outputs");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 7 – C. How / Architecture   (narrow split, two cards)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "C. How", "How It Was Built - Architecture", "07 / 12");
  const { lx, lw, rx, rw } = cols(true);
  const cardGap = 0.14;
  const cardH   = (CONT_H - cardGap) / 2;

  addCard(pres, s, "Technology", [
    "React + TypeScript + Vite",
    "Recharts for chart rendering",
    "PWA support for offline usage",
    "Local-first storage model"
  ], lx, CONT_Y, lw, cardH, true);

  addCard(pres, s, "Code Structure", [
    "UI components for interaction and rendering",
    "Hooks for shared state and persistence",
    "Pure logic modules for simulation and analysis",
    "Tests focused on logic correctness"
  ], lx, CONT_Y + cardH + cardGap, lw, cardH, true);

  addImg(pres, s, "./PH_05_APP_STRUCTURE_VIEW.png", rx, CONT_Y, rw, CONT_H, "Application structure view");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 8 – C. How / Execution Flow
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "C. How", "How It Was Built - Execution Flow", "08 / 12");
  const { lx, lw, rx, rw } = cols();
  addBullets(s, [
    "Edit circuit in UI and validate placement/state inputs",
    "Compile circuit plan and run simulation kernels",
    "Sample outcomes (ideal and noisy paths)",
    "Compute analysis metrics and render synchronized views",
    "Use caching and alias sampling to keep interaction responsive"
  ], lx, CONT_Y, lw, CONT_H, 12);
  addImg(pres, s, "./PH_06_EXECUTION_RESULTS_VIEW.png", rx, CONT_Y, rw, CONT_H, "Execution results view");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 9 – C. How / Engineering Choices   (narrow split, two cards)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "C. How", "How It Was Built - Engineering Choices", "09 / 12");
  const { lx, lw, rx, rw } = cols(true);
  const cardGap = 0.14;
  const cardH   = (CONT_H - cardGap) / 2;

  addCard(pres, s, "Choice", [
    "Local-first execution",
    "Strict typing + tests",
    "Progressive disclosure UI"
  ], lx, CONT_Y, lw, cardH, true);

  addCard(pres, s, "Reason and Tradeoff", [
    "Easy classroom/lab usage, with bounded qubit scale",
    "Lower regression risk, with heuristic optimizers",
    "Simple beginner flow, with lite interop scope"
  ], lx, CONT_Y + cardH + cardGap, lw, cardH, true);

  addImg(pres, s, "./PH_08_NOISE_COMPARISON.png", rx, CONT_Y, rw, CONT_H, "Ideal vs noisy comparison");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 10 – D. Demo / App Demonstration Plan   (demo steps)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "D. Demo", "App Demonstration Plan", "10 / 12");
  const { lx, lw, rx, rw } = cols(true);

  const steps = [
    ["01", "Load Bell template and explain the circuit editor"],
    ["02", "Run ideal shots and inspect probability/histogram tabs"],
    ["03", "Turn on noise and compare ideal vs noisy outcomes"],
    ["04", "Open analysis panels and summarize key metrics"]
  ];
  const stepGap = 0.10;
  const stepH   = (CONT_H - stepGap * (steps.length - 1)) / steps.length;
  steps.forEach(([no, text], i) => {
    addDemoStep(pres, s, no, text, lx, CONT_Y + i * (stepH + stepGap), lw, stepH);
  });

  addImg(pres, s, "./PH_07_BELL_IDEAL_RUN.png", rx, CONT_Y, rw, CONT_H, "Bell circuit ideal run");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 11 – D. Demo / Demo Continuation   (34/66 split, 2 images)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "D. Demo", "Demo Continuation", "11 / 12");

  // Extra-narrow left: 34 / 66
  const lRatio = 0.34;
  const lw = CONT_W * lRatio - GAP / 2;
  const rw = CONT_W * (1 - lRatio) - GAP / 2;
  const rx = CONT_X + lw + GAP;

  const steps = [
    ["05", "Run one Simulator Lab workflow (optimizer or sweep)"],
    ["06", "Show hardware compatibility and routing feedback"],
    ["07", "Export OpenQASM and report artifacts"],
    ["08", "State current limits and expected future improvements"]
  ];
  const stepGap = 0.10;
  const stepH   = (CONT_H - stepGap * (steps.length - 1)) / steps.length;
  steps.forEach(([no, text], i) => {
    addDemoStep(pres, s, no, text, CONT_X, CONT_Y + i * (stepH + stepGap), lw, stepH);
  });

  // Two images side by side on the right
  const imgGap = 0.12;
  const imgW   = (rw - imgGap) / 2;
  addImg(pres, s, "./PH_09_SIMULATOR_LAB_WORKFLOW.png", rx,            CONT_Y, imgW, CONT_H, "Simulator lab workflow");
  addImg(pres, s, "./PH_10_EXPORT_OUTPUTS.png",         rx + imgW + imgGap, CONT_Y, imgW, CONT_H, "Export outputs");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 12 – Closing / Summary and Questions
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "Closing", "Summary and Questions", "12 / 12");
  const { lx, lw, rx, rw } = cols();
  addBullets(s, [
    "Background: local-first simulator for learning and technical workflows",
    "What: editor, simulation, analysis, advanced lab, and interop implemented",
    "How: modular architecture with test-backed logic core",
    "Demo: end-to-end run from circuit creation to export"
  ], lx, CONT_Y, lw, CONT_H, 12);
  addImg(pres, s, "./PH_06_EXECUTION_RESULTS_VIEW.png", rx, CONT_Y, rw, CONT_H, "Execution and analysis overview");
}

// ═══════════════════════════════════════════════════════════════════
// Slide 13 – Template / Empty Template Page
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "Template", "Empty Template Page", "13 / 14");
  s.addShape(pres.shapes.RECTANGLE, {
    x: CONT_X, y: CONT_Y, w: CONT_W, h: CONT_H,
    fill: { color: "F4F9FF" },
    line: { color: "B9C8D8", width: 1, dashType: "dash" }
  });
}

// ═══════════════════════════════════════════════════════════════════
// Slide 14 – Style Guide / Fonts, Colors, and PPTX Rules
// ═══════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(pres, s, "Style Guide", "Fonts, Colors, and PPTX Rules", "14 / 14");
  const { lx, lw, rx, rw } = cols(true);
  const cardGap = 0.14;
  const cardH   = (CONT_H - cardGap) / 2;

  addCard(pres, s, "Typography", [
    "Headings: Plus Jakarta Sans, bold",
    "Body: Plus Jakarta Sans, regular/medium",
    "Code and labels: JetBrains Mono"
  ], lx, CONT_Y, lw, cardH, false);

  addCard(pres, s, "Color and Layout", [
    "Primary blue: #0F4C81",
    "Background: white + soft blue gradients",
    "Use square corners and tight margins in PPTX"
  ], lx, CONT_Y + cardH + cardGap, lw, cardH, false);

  addImg(pres, s, "./PH_01_APP_HERO_OVERVIEW.png", rx, CONT_Y, rw, CONT_H, "Reference image for presentation style");
}

// ═══════════════════════════════════════════════════════════════════
// Write file
// ═══════════════════════════════════════════════════════════════════
const OUT = "quantum_circuit_simulator.pptx";
pres.writeFile({ fileName: OUT })
  .then(() => console.log(`✓  Saved: ${OUT}`))
  .catch(err => { console.error("Error writing file:", err); process.exit(1); });
