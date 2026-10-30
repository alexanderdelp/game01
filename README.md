# Game01

Ein Action-RPG in Pixel-Art mit prozedural generierter, lebendiger Welt – High-Fantasy trifft Cyberpunk.
Komplett von Claude Code entwickelt.

**Spielen:** https://alexanderdelp.github.io/game01/ (Seed per URL: `?seed=mein-seed`)

## Stand

Siehe [Meilensteine](docs/milestones/) und [Design-Dokument](docs/DESIGN.md). Arbeitsregeln und Entscheidungen: [CLAUDE.md](CLAUDE.md).

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests (Vitest)
npm run build    # Typprüfung + Produktions-Build
npm run e2e      # Akzeptanztests (Playwright, nutzt den Build)
```

Werkzeuge: `npx vite-node tools/preview-map.ts <seed> out.png` (Weltkarte), `tools/preview-area.ts` (Ausschnitt).

## Lizenzen & Credits

- Code: MIT (siehe `LICENSE`).
- Landschaftsgrafiken: prozedural im Code erzeugt bzw. als Pixel-Raster im Code gezeichnet (`src/render/sprites.ts`), Teil des Codes.
- Externe Assets werden in [CREDITS.md](CREDITS.md) mit Lizenz aufgeführt.
