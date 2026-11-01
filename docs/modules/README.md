# Module & parallele Arbeit

Ziel: An einem Teil des Spiels fokussiert arbeiten können (eigener Chat, eigener Agent), ohne das ganze Spiel im
Kontext zu haben – und mehrere Agenten gleichzeitig arbeiten lassen, ohne dass sie sich in die Quere kommen.

## Grundsätze

1. **Ein Modul = ein Ordner mit klarer Schnittstelle.** Andere Teile benutzen nur die Schnittstelle, nicht die Innereien.
2. **Jedes Modul ist isoliert startbar oder testbar** (eigene Szene, Vorschau-Werkzeug oder reine Unit-Tests).
3. **Jedes Modul hat eine Anleitung** in `docs/modules/<modul>.md` (Ziel, Dateien, Schnittstellen, Tests, Regeln)
   und eine kurze `CLAUDE.md` im Ordner, die Claude Code automatisch lädt, sobald dort gearbeitet wird.
4. **Ein Agent pro Modul, eigener Git-Worktree und Branch** (`modul/<name>`). Integration (Zusammenführen auf
   `main`, Gesamttests, Deploy) macht ein Agent – der „Integrator“.
5. **Schnittstellen ändern nur mit Absprache:** Muss ein Modul-Agent eine Schnittstelle ändern, schreibt er es in
   seine Übergabe; der Integrator passt die anderen Seiten an.

## Module

| Modul | Ordner / Dateien | Isoliert prüfen | Anleitung |
|---|---|---|---|
| **Kampf** | `src/combat`, `src/arena`, `src/entities/{PlayerCombat,Enemy,Actor}.ts` | `npm run arena` | [kampf.md](kampf.md) |
| **Welt** (Gelände, Höhen, Sicht, Darstellung) | `src/world` (ohne `meta.ts`, `npcs.ts`), `src/render` (ohne `TownDecor`, `Markers`), `src/scenes/world/WorldSight.ts` | `tools/preview-area.ts`, `preview-map.ts`, `biome-stats.ts` | [welt.md](welt.md) |
| **Weltenbau** (Reiche, Orte, lebendige Welt) | `src/world/{meta,npcs}.ts`, `src/sim`, `src/state/worldState.ts`, `src/render/{TownDecor,Markers}.ts`, `src/entities/NpcManager.ts` | Unit-Tests | [weltenbau.md](weltenbau.md) |
| **Inhalte** (Quests, Gespräche) | `src/quests`, `src/scenes/world/WorldTalk.ts` | Unit-Tests, `tests/e2e/inhalte.spec.ts` | [inhalte.md](inhalte.md) |
| **Figur** (Völker, Aussehen, Ausrüstung, Fortschritt) | `src/character`, `src/rpg`, `src/entities/HeroController.ts`, `src/scenes/CreateScene.ts`, `src/ui/HeroPanel.ts` | Erschaffungsbildschirm | [figur.md](figur.md) |
| **Oberfläche** (HUD, Karte, Menüs, Klang) | `src/scenes/{UIScene,TitleScene}.ts`, `src/ui`, `src/audio` | Spiel in Handy- und Laptop-Größe | [oberflaeche.md](oberflaeche.md) |
| **Netz** (geteilte Welt, Live) | `src/net`, `src/state/{share,sync}.ts`, `src/entities/RemotePlayers.ts`, `src/scenes/world/WorldNet.ts`, `server/` | `node server/sync-server.mjs` | [netz.md](netz.md) |

**Knotenpunkte** (gehören dem Koordinator): `src/scenes/WorldScene.ts`, `src/main.ts`, `src/world/biomes.ts`,
`package.json`, `tests/e2e/helpers.ts`, `CLAUDE.md`, `docs/DESIGN.md`. Wie mehrere Agenten zusammenarbeiten:
[KOORDINATION.md](KOORDINATION.md).

## Einen fokussierten Chat starten

In einer neuen Claude-Code-Sitzung im Projektordner:

```
/kampf <was du ändern möchtest>
```

Der Skill (`.claude/skills/kampf/SKILL.md`) lädt nur die Kampf-Anleitung, startet die Arena und arbeitet in deren
Grenzen. Für die anderen Module: `/modul <name> <auftrag>` (z. B. `/modul welt Wasserfälle an Klippen`).
Koordinieren: `/koordinieren <wunsch>`.

## Mehrere Agenten gleichzeitig

```bash
git worktree add ../game01-kampf -b modul/kampf      # eigener Ordner + Branch für den Kampf-Agenten
cd ../game01-kampf && npm ci && npm run arena
```

- Jeder Agent arbeitet in seinem Worktree und committet auf seinen Branch; niemand pusht direkt auf `main`.
- Der Integrator führt die Branches zusammen, lässt `npm run check` laufen und deployt.
- Konflikte vermeiden: Jeder Agent bleibt in den Dateien seines Moduls (Tabelle oben). Geteilte Dateien
  (`src/debug.ts`, `src/main.ts`, `CLAUDE.md`) nur minimal und additiv ändern.
- In der Claude-Desktop-App kann der Integrator Modul-Sitzungen direkt als eigene Sessions mit eigenem Worktree
  starten; jede meldet sich mit einer Zusammenfassung zurück.
