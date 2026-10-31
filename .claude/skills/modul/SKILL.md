---
name: modul
description: Fokussierte Sitzung an einem Modul von Splitterwelten (welt, weltenbau, inhalte, figur, oberflaeche, netz, kampf), ohne das ganze Spiel zu laden. Nutzen, wenn eine Session einen Auftrag für genau ein Modul bekommt oder der Nutzer /modul <name> <auftrag> aufruft.
---

# Modul-Sitzung

Aufruf: `/modul <name> <auftrag>` – `$ARGUMENTS` (erstes Wort = Modulname).

1. Lies `CLAUDE.md` (Projektregeln, Wünsche an das Spiel) und **nur** `docs/modules/<name>.md` sowie die dort
   genannten Dateien. Andere Module nur über ihre Schnittstellen anfassen. Für `kampf` gibt es `/kampf`.
2. Du arbeitest in einem eigenen Git-Worktree auf einem eigenen Branch (`modul/<name>-<thema>`). Nie direkt auf
   `main` committen, nie pushen – das macht der Koordinator.
3. Setze den Auftrag um. Knotenpunkte (`src/scenes/WorldScene.ts`, `src/main.ts`, `src/world/biomes.ts`,
   `CLAUDE.md`, `docs/DESIGN.md`, `package.json`, `tests/e2e/helpers.ts`) nicht ändern – nötige Änderungen dort
   beschreibst du in der Übergabe. Ausnahme: `src/debug.ts` und `src/scenes/world/worldDebug.ts` additiv.
4. Tests: die Befehle aus der Modul-Anleitung (Unit + betroffene E2E; vor E2E immer `npm run build`). Neue
   Funktionen bekommen Unit-Tests; sichtbare Abläufe einen E2E-Test in `tests/e2e/`.
5. Entscheidungen und Annahmen kurz in den Auftrag-/Meilenstein-Text (`docs/milestones/…`) schreiben, nicht in
   `CLAUDE.md` (das pflegt der Koordinator).
6. Committe auf deinen Branch und beende mit einer **Übergabe** (kurz):
   - Was geändert (Dateien), was getestet (Befehle, Ergebnis)
   - Schnittstellen- oder Knotenpunkt-Änderungen, die der Koordinator machen muss
   - Offene Fragen an den Nutzer, Screenshots (Pfad) bei Optik
