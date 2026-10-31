# M21 – Kampf-Arena & Module (Nutzerwunsch)

## Warum?

Das Spielgefühl im Kampf ist zentral. Der Nutzer möchte gezielt daran arbeiten können – in einem eigenen Chat,
ohne das ganze Spiel im Kontext – und künftig mit mehreren Agenten parallel.

## Design

- **Entkopplung:** Gegner und Spielerkampf brauchen nur noch ein schmales `CombatTerrain` statt Weltgenerator und
  Chunks; `EnemyManager` kann Gegner ohne Welt einsetzen (`add`). Lauftempo (`PLAYER_MOVE`) steht jetzt neben
  `PLAYER_SWING` in `combat.ts`.
- **Kampf-Arena** (`?arena=1`, `npm run arena`): abgeschlossene Fläche mit Säulen, Gegner per Knopf, Live-Regler für
  alle Kampfwerte, Statistik, „Werte kopieren“ als Code. Läuft ohne Weltgenerierung → startet sofort.
- **Module:** `docs/modules/README.md` (Grundsätze, Modultabelle, parallele Agenten mit Worktrees),
  `docs/modules/kampf.md` (Anleitung), `CLAUDE.md` in `src/combat` und `src/arena`, Projekt-Skill `/kampf`.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Arena startet ohne Welt; Gegner per Knopf; Regler wirken sofort und bleiben gespeichert; Werte als Code. | E2E |
| R2 | Kampf in der Welt unverändert (alle bisherigen Kampftests grün). | E2E |
| R3 | Anleitung, CLAUDE.md und Skill für fokussierte Kampf-Sitzungen. | Dateien |

## Ergebnis

Erreicht am 2026-10-31: `tests/e2e/arena.spec.ts`; alle bisherigen Tests grün.
