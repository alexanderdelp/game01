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

| Modul | Ordner | Isoliert starten / prüfen | Anleitung | Schnittstelle |
|---|---|---|---|---|
| **Kampf** | `src/combat`, `src/arena`, `src/entities/{PlayerCombat,Enemy,Actor}.ts` | `npm run arena` (Kampf-Arena) | [kampf.md](kampf.md) | `CombatTerrain`, `CombatCtx`, `PLAYER_SWING`, `PLAYER_MOVE`, `ENEMIES` |
| Welt (Gelände) | `src/world` (ohne `meta.ts`), `src/render/chunkPixels.ts` | `npx vite-node tools/preview-area.ts`, `tools/preview-map.ts`, `tools/biome-stats.ts` | – (folgt bei Bedarf) | `WorldGen.biomeAt/decorationAt/climate` |
| World Building | `src/world/meta.ts`, `src/world/lore` | Unit-Tests `m8`, `m14`, `m15`, `m19` | – | `WorldMeta` |
| Figuren | `src/character` | Erschaffungsbildschirm (`?seed=neu`) | – | `Appearance`, `layersFor`, `buildCharacter` |

Weitere Module (Quests, Simulation, Netz, UI) bekommen eine Anleitung, sobald jemand fokussiert daran arbeiten will.

## Einen fokussierten Chat starten

In einer neuen Claude-Code-Sitzung im Projektordner:

```
/kampf <was du ändern möchtest>
```

Der Skill (`.claude/skills/kampf/SKILL.md`) lädt nur die Kampf-Anleitung, startet die Arena und arbeitet in deren
Grenzen. Für andere Module entsprechend `/welt …` usw., sobald es sie gibt.

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
