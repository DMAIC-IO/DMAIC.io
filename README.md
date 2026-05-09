# D.Mike — A DMAIC Toolbox

**A modular, browser-based Six Sigma toolbox — inspired by Minitab, running without a server, without a build step, without a framework.**

[![Made with Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-f7df1e?logo=javascript&logoColor=black)](#tech-stack)
[![No Build](https://img.shields.io/badge/build-none-brightgreen)](#installation--getting-started)
[![Offline-first](https://img.shields.io/badge/offline-first-blue)](#principles)
[![i18n DE | EN](https://img.shields.io/badge/i18n-DE%20%7C%20EN-orange)](#principles)
[![Handbook](https://img.shields.io/badge/docs-docs.dmaic.io-lightgrey)](https://docs.dmaic.io)

---

## About the Project
 
**D.Mike** is a web application that covers the full DMAIC cycle (**D**efine, **M**easure, **A**nalyze, **I**mprove, **C**ontrol) directly in the browser. Each phase can be freely composed from tool modules (SIPOC, C&E Matrix, Process Capability, MSA, DOE, and many more). All data stays locally in the browser — no backend, no tracking, no runtime dependency on external services.

The project targets quality engineers, Six Sigma practitioners (Green/Black Belts), process improvement specialists, and students looking for a lean, transparent, and extensible alternative to traditional statistics software.

---

## Features

- **DMAIC workflow** — Phase tiles (D · M · A · I · C) as the central navigation
- **Module system** — Each tool is a self-contained, standardized module with lifecycle hooks (`init`, `destroy`, `getState`, `setState`)
- **Custom SVG chart engine** — Scatter, histogram, box plot, control charts, probability plot, Pareto, pie, capability plots — no third-party charting library
- **DataGrid** — Built-in spreadsheet component with copy/paste, CSV/XLSX import/export, and undo/redo
- **Algorithm Lab** — Interactive sandbox for statistical algorithms with LaTeX formulas (KaTeX), syntax highlighting (Prism.js), and a Try-It panel (manual, fixtures, CSV)
- **Verified statistical engines** — Shapiro-Wilk (AS R94), Anderson-Darling, Jarque-Bera, Cp/Cpk/Pp/Ppk, Pearson/Spearman/Kendall, MSA Type 1 & 2 (Gage R&R), DOE planner
- **Offline-first** — Persistence via `localStorage` / `IndexedDB`, no network requests after the initial load
- **Export / Import** — Projects can be saved, versioned, and restored as JSON (with a migration chain for older formats)
- **Bilingual** — English and German, switchable at runtime, no hardcoded strings
- **Dark & Light mode** — Theme switching via CSS custom properties
- **Integrated handbook** — Context-sensitive help per module (methodology, example, interpretation, pitfalls); also available as a static site at [docs.dmaic.io](https://docs.dmaic.io)
- **Gold-standard validation** — Automated tests against reference values from Minitab, R, and NIST

---

## Tech Stack

| Area                | Technology                                                |
| ------------------- | --------------------------------------------------------- |
| Language            | HTML5, CSS3, Vanilla JavaScript (ES Modules)              |
| Frameworks          | None (no React, Vue, Angular)                             |
| Build tool          | None                                                      |
| Charts              | Custom SVG chart engine (`js/core/chart/`)                |
| Import/Export       | SheetJS (XLSX), PapaParse (CSV)                           |
| Formulas            | KaTeX                                                     |
| Syntax highlighting | Prism.js                                                  |
| Fixture generator   | Python / SciPy (dev tool only, not used at runtime)       |

---

## Principles

1. **Modularity** — Every module is self-contained and can be developed, tested, and maintained independently.
2. **Offline-first** — Everything runs locally in the browser. No server, no cloud, no dependencies after the initial load.
3. **Export / Import** — Projects, settings, and analyses can be saved as JSON and restored at any time.
4. **Bilingual** — EN/DE from day one; every UI string comes from the translation files.
5. **Themeable** — Dark and light mode are first-class citizens; modules respect the active theme via CSS variables.
6. **Verified** — Statistical algorithms are validated against gold-standard references.

---

## Installation & Getting Started

**No build step required.** You have two options:

### Option 1 — Start a local dev server (recommended)

```bash
git clone https://github.com/DMAIC-IO/DMAIC.io.git
cd DMAIC.io
npm run dev
```

This runs `npx serve .` and exposes the app at `http://localhost:3000` (or whichever port `serve` reports).

### Option 2 — Open directly in the browser

```bash
git clone https://github.com/DMAIC-IO/DMAIC.io.git
```

Simply open `index.html` in any modern browser (current versions of Chrome, Firefox, Edge, or Safari).

> **Note:** The app is designed for desktop only (minimum viewport 1280 × 720 px). There are intentionally no responsive breakpoints for mobile or tablet.

---

## Project Structure

```
DMAIC.io/
├── index.html                  # Entry point
├── app.html                    # Main application shell
├── css/                        # Variables, layout, components, modules
├── js/
│   ├── app.js                  # Bootstrap
│   ├── core/                   # Module registry, event bus, state, i18n, theme
│   │   ├── chart/              # SVG chart framework
│   │   └── datagrid/           # Spreadsheet component
│   ├── engines/                # Statistical engines (normality, capability, MSA, DOE …)
│   ├── algorithm-lab/          # Interactive algorithm sandbox
│   ├── modules/                # One folder per tool (SIPOC, C&E Matrix, …)
│   └── ui/                     # Sidebar, DMAIC tiles, workspace, help panel, modal
├── i18n/                       # de.json · en.json
├── tests/                      # Browser-based test runner + fixtures
├── tools/                      # Fixture generator (Python/SciPy), static-handbook builder
├── vendor/                     # SheetJS, KaTeX, Prism.js, PapaParse
├── assets/icons/               # SVG icons
├── docs-dist/                  # Generated static handbook (docs.dmaic.io)
└── CHANGELOG.md
```

---

## Module Interface

Every module exports a default object conforming to this contract:

```js
export default {
  id: 'sipoc',
  phase: 'define',            // define | measure | analyze | improve | control
  icon: 'clipboard-list',
  i18nKey: 'modules.sipoc',
  version: '1.0.0',

  // Lifecycle
  async init(container, context) {},
  async destroy() {},
  onLanguageChange(lang) {},
  onThemeChange(theme) {},

  // State / persistence
  getState() {},
  setState(data) {},

  // Optional handbook (lazy-loaded)
  help: () => import('./sipoc-help.js'),
};
```

The `context` provides `eventBus`, `stateManager`, `chartManager`, `i18n`, `theme`, `language`, `showModal`, and `notify`.

---

## Testing

Tests run directly in the browser using a custom runner:

```bash
# Start the dev server …
npm run dev
# … and open the runner in your browser:
# http://localhost:3000/tests/runner.html
```

Every statistical algorithm is validated against **gold-standard fixtures** sourced from Minitab, R, or NIST. Fixtures live under `tests/fixtures/`. New fixtures are produced via the Python/SciPy generator under `tools/fixture-generator/`.

---

## Documentation

Detailed technical documentation lives under `docs/`:

| Topic                          | File                                    |
| ------------------------------ | --------------------------------------- |
| Architecture & module system   | `docs/ARCHITECTURE.md`                  |
| UI layout                      | `docs/LAYOUT.md`                        |
| Internationalization           | `docs/INTERNATIONALIZATION.md`          |
| Theming                        | `docs/THEMING.md`                       |
| Chart framework                | `docs/CHARTING.md`                      |
| DataGrid                       | `docs/DATAGRID.md`                      |
| Data persistence               | `docs/DATA-PERSISTENCE.md`              |
| Testing & validation           | `docs/TESTING.md`                       |
| Algorithm Lab                  | `docs/ALGORITHM-LAB.md`                 |
| Algorithm JSON schema          | `docs/ALGORITHM-JSON-SCHEMA.md`         |
| Fixture schema & tiers         | `docs/FIXTURE-SCHEMA.md`                |
| Fixture generator              | `docs/FIXTURE-GENERATOR.md`             |
| Versioning & changelog         | `docs/VERSIONING.md`                    |
| Help system & handbooks        | `docs/HELP-SYSTEM.md`                   |
| Prototype integration          | `docs/PROTOTYPE-INTEGRATION.md`         |
| Split-panel layout             | `docs/SPLIT-PANEL.md`                   |

The public handbook is also available at **[docs.dmaic.io](https://docs.dmaic.io)**.

---

## Coding Conventions

- **ES Modules** (`import` / `export`) — no CommonJS
- **No global variables** — everything scoped through modules or the event bus
- **CSS custom properties** for colors and spacing — never hardcode color values
- **Semantic HTML** — `<section>`, `<nav>`, `<header>`, `<button>`, etc.
- **BEM-light** for CSS classes: `.module-sipoc__header`, `.dmaic-tile--active`
- **JSDoc** on all public functions
- **All user-facing strings** go through i18n keys — never hardcode text
- **German text: real Unicode** — always use ä, ö, ü, ß (never ae/oe/ue/ss substitutions)
- **Desktop only** — minimum viewport 1280 × 720 px
- **Charts always via `context.chartManager`** — never build custom Canvas/SVG rendering inside a module

---

## Contributing

Contributions are welcome. Before opening a PR for a new tool module:

1. Read `docs/ARCHITECTURE.md` and the **Module Interface** (see above).
2. Place your module under `js/modules/<your-module>/` following the standard structure (`.js`, `.html`, `.css`, `-help.js`).
3. Add translations in `i18n/de.json` and `i18n/en.json`.
4. Write tests under `tests/modules/` — include fixture validation for anything with statistical logic.
5. If your module or help content changes: regenerate the static handbook (`node tools/static-handbook/build.mjs`) and commit `docs-dist/` together with the source changes.
6. Update `CHANGELOG.md` following the Keep a Changelog format.

Please file issues and pull requests on GitHub: <https://github.com/DMAIC-IO/DMAIC.io>

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see the [LICENSE](LICENSE) file for details.

Commercial licensing is available for organizations that cannot comply with the AGPL terms. Contact: info@dmaic.io

---

## Roadmap (Excerpt)

- Additional DMAIC modules across all five phases
- Extension of the Algorithm Lab with more categories (e.g. time series, non-parametric methods)
- Expansion of the DOE planner (D-optimal, response-surface methods)
- More tutorials and walkthroughs in the static handbook (docs.dmaic.io)

For open items and details, see [Issues](https://github.com/DMAIC-IO/DMAIC.io/issues).
