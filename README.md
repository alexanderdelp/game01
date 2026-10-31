# Splitterwelten (Game01)

Ein Action-RPG in Pixel-Art mit prozedural generierter, lebendiger Welt – High-Fantasy trifft Cyberpunk.
Komplett von Claude Code entwickelt.

**Spielen:** https://alexanderdelp.github.io/game01/ (Titelbildschirm mit Weltauswahl; direkt: `?seed=mein-seed`)

Steuerung: WASD/Pfeile laufen · Leertaste angreifen · K Zauber · E reden/benutzen · Q Trank · M Karte · H Menü (Held, Quests,
Chronik, Neuigkeiten, Teilen, Schild, Chat, Musik). Am Handy: Ziehen = laufen, Knöpfe ⚔ / E / ♥ und ☰.
Gamepad: Stick laufen, A Angriff, RT Zauber, X Reden, Y Trank, Start Menü, Select Karte.

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

Werkzeuge: `npx vite-node tools/preview-map.ts <seed> out.png` (Weltkarte), `tools/preview-area.ts` (Ausschnitt), `tools/preview-decor.ts` (Sprites), `tools/import_lpc.py` (LPC-Import).

## Gemeinsam spielen

- **Per Link:** Im Spiel `G` (Teilen) → „Link kopieren“ und an Freunde schicken. Die Weltdaten stecken im Link-Anker.
- **Automatisch und live über einen eigenen Server:** `node server/sync-server.mjs 8787` betreiben (HTTPS) und das Spiel mit
  `?seed=<welt>&sync=https://<dein-server>` öffnen. Dann seht ihr euch live, kämpft gemeinsam und chattet (Enter)
  – siehe [M11](docs/milestones/M11-geteilte-welt.md) und [M12](docs/milestones/M12-live.md).

## Lizenzen & Credits

- Code: MIT (siehe `LICENSE`).
- Landschaftsgrafiken: prozedural im Code erzeugt (`src/render/procSprites.ts`, `src/render/groundPatterns.ts`).
- Figuren: LPC-Sprites (CC-BY-SA 3.0 / GPL 3.0), siehe [CREDITS.md](CREDITS.md).
- Externe Assets werden in [CREDITS.md](CREDITS.md) mit Lizenz aufgeführt.
