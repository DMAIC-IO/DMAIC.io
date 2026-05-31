# Glossar — Fachbegriffe-Katalog

Zentraler Katalog für Six-Sigma-/Statistik-Fachbegriffe. Wird konsumiert von:

- **Hilfe-Panel** (in-App, dritter Tab „Glossar") — kontext-gefiltert pro Modul
- **Inline-Verlinkung** im Hilfetext über das Markup `{{term:<id>}}`
- **Static-Handbook** (`/glossar/<id>.html`) — SEO-Eingang ins öffentliche Handbuch

Konzept und UX-Details: [`.claude/GLOSSAR-KONZEPT.md`](../../../.claude/GLOSSAR-KONZEPT.md)
(im privaten Site-Repo).

## Struktur

```
glossary/
├── README.md            # diese Datei
├── index.json           # Kategorien + Begriffsverzeichnis
└── terms/
    ├── varianz.json
    └── …
```

## Schema (Index)

```json
{
  "version": "1.0",
  "categories": [
    { "id": "<slug>", "label": { "de": "...", "en": "..." } }
  ],
  "terms": [
    { "id": "<slug>", "category": "<category-id>", "file": "terms/<slug>.json" }
  ]
}
```

## Schema (Einzelbegriff)

```json
{
  "id": "<kebab-case-slug>",
  "category": "<category-id aus index.json>",
  "title":   { "de": "Vollständiger Titel (DE)", "en": "Full title (EN)" },
  "short":   { "de": "Einzeiler für Tooltip/Liste (max ~120 Z.)", "en": "..." },
  "definition": {
    "de": [
      { "type": "paragraph", "text": "Fließtext. Verweise auf andere Begriffe via {{term:<id>}}." },
      { "type": "formula",   "latex": "\\sigma^2 = \\frac{1}{n}\\sum (x_i - \\mu)^2" },
      { "type": "list",      "items": ["Punkt 1", "Punkt 2"] }
    ],
    "en": [ /* gespiegelt */ ]
  },
  "aliases": { "de": ["Synonym 1"], "en": ["Synonym 1"] },
  "seeAlso": ["other-term-id", "..."],
  "modules": ["module-id-1", "module-id-2"],
  "algoLab": ["<category>/<algo-id>"],
  "sources": [
    { "label": "Quelle (Buch, Norm, …)", "url": null }
  ]
}
```

### Block-Typen für `definition`

| Typ | Felder | Rendert als |
|---|---|---|
| `paragraph` | `text` | Absatz, **fett** und *kursiv* via Markdown-lite |
| `formula`   | `latex` | KaTeX-Block-Formel |
| `list`      | `items[]` | Aufzählung |
| `note`      | `text` | Hinweis-Box |

## Schreib-Richtlinien

- **Definition in einem Satz** zuerst — `short` ist die Tooltip-Zeile
- **Formeln in KaTeX**, nie als Bild
- **Sprache:** DE in Sie-Form, EN sachlich neutral
- **Produktname:** „DMAIC.io" (nie „D.Mike")
- **Verweise auf andere Begriffe** im Fließtext mit `{{term:<id>}}` — Module nicht
  inline benennen, sondern über das `modules`-Feld
- **Mindestens eine Quelle** (Lehrbuch oder Norm) pro Eintrag
- `id` ist stabil — wird URL-Anker im Handbuch und Markup-Token. **Niemals umbenennen**

## Neuen Begriff anlegen

1. `terms/<id>.json` schreiben gemäß Schema
2. Eintrag in `index.json` unter `terms[]` ergänzen
3. Im Projekt nach dem Begriff suchen (DE + EN, inkl. Beugungen) und in den
   Trefferdateien `modules`-Feld pflegen
4. Bei aktivem `{{term:…}}`-Renderer: an den Fundstellen das Markup einsetzen
   (erste Erwähnung pro Hilfetext genügt)
