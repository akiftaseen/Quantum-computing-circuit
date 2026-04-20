# Quantum Circuit Simulator Presentation Script

## Individual-Day Versions
- Person 1 script: PRESENTATION_SCRIPT_PERSON1.md
- Person 2 script: PRESENTATION_SCRIPT_PERSON2.md
- Both versions keep the same 12-slide order to avoid slide redesign.

Date: 2026-04-20
Deck target: slides.html (12 slides)
Suggested pace: 10 to 14 minutes total

This script matches the shorter structure:
1. Background and motivation
2. What was done this semester
3. How it was done
4. App demonstration

## Slide 1 - Quantum Circuit Simulator
"Good [morning/afternoon]. This presentation is organized in four parts: first, why this project matters; second, what I completed this semester; third, how I implemented it; and fourth, a live demonstration of the app."

## Slide 2 - Project Motivation
"The motivation was practical. I wanted a quantum circuit tool that runs locally in the browser, supports teaching use cases, and still gives enough depth for technical experiments. Many existing tools are either easy but limited, or powerful but heavy for classroom use."

## Slide 3 - Project Goals
"The goals were clear: build circuits quickly, run ideal and noisy simulation, support import and export workflows, and keep the interface simple for beginners while still offering advanced options when needed."

## Slide 4 - What Was Implemented
"This semester, I implemented both core and advanced features. Core work includes the editor, simulation views, and execution controls. Advanced work includes noise configuration, optimization workflows, hardware checks, and interoperability support."

## Slide 5 - Evidence of Completed Work
"This slide summarizes concrete evidence. The project currently includes 37 logic modules, 15 logic test files, and 104 logic test cases. I also implemented persistence features such as draft management and session continuity."

## Slide 6 - Scope and Honest Limits
"I also want to be explicit about limits. The current simulator is bounded to 6 qubits for browser practicality. The OpenQASM pathway is a practical subset, not full language coverage. Routing and calibration are heuristic and intentionally lightweight for interactive use."

## Slide 7 - How It Was Built - Architecture
"Implementation uses React, TypeScript, and Vite. The codebase is separated into components for UI, hooks for shared state behavior, and pure logic modules for simulation and analysis. This separation helps testing and keeps logic independent from rendering behavior."

## Slide 8 - How It Was Built - Execution Flow
"The runtime flow is: edit a circuit, validate it, compile the execution plan, run simulation, sample outcomes, and render synchronized analysis panels. Caching and alias-based shot sampling are used to keep interaction responsive during repeated runs."

## Slide 9 - How It Was Built - Engineering Choices
"The main choices were local-first execution, strict typing with tests, and progressive disclosure in the UI. These choices improve reliability and usability, but they also come with tradeoffs, such as bounded scale and heuristic methods in advanced modules."

## Slide 10 - App Demonstration Plan
"For the demo, I will start with a Bell template, run ideal shots, then enable noise and compare outcomes. After that I will open analysis panels to show how the app explains results."

## Slide 11 - Demo Continuation
"I will then run one Simulator Lab workflow, show hardware compatibility feedback, and finish by exporting OpenQASM and a report artifact. I will also point out current limits as part of the demonstration."

## Slide 12 - Summary and Questions
"To summarize: the motivation was to build a practical local-first simulator, the semester work delivered a full editor-to-analysis workflow, the implementation is modular and test-backed, and the demo shows the end-to-end path in the app. Thank you, and I welcome your questions."

## Optional Timing Guide
- Slides 1 to 3: 2 to 3 minutes
- Slides 4 to 6: 3 to 4 minutes
- Slides 7 to 9: 3 to 4 minutes
- Slides 10 to 12: 2 to 3 minutes

## Delivery Notes
- Keep transitions short and natural; do not read bullets word-for-word.
- Pause after slides 6 and 11 for likely questions.
- If time is tight, compress slide 9 into one sentence.