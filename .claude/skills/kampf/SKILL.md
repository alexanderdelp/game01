---
name: kampf
description: Fokussierte Sitzung am Kampfsystem von Splitterwelten (Steuerung, Spielgefühl, Gegner) in der Kampf-Arena, ohne den Rest des Spiels zu laden. Nutzen, wenn der Nutzer am Kampf, an Gegnern oder am Spielgefühl arbeiten will oder /kampf aufruft.
---

# Kampf-Sitzung

1. Lies **nur** `docs/modules/kampf.md` und die dort genannten Dateien. Lies `CLAUDE.md` (Projektregeln) – den Rest
   des Spiels (Welt, Quests, Netz, UI) nicht laden, außer eine Schnittstelle verlangt es.
2. Starte die Vorschau (`.claude/launch.json` → „spiel“), öffne `/?arena=1` und prüfe das Verhalten dort.
3. Setze den Auftrag des Nutzers um: `$ARGUMENTS`. Spielgefühl-Änderungen erst als Arena-Werte ausprobieren,
   dann in `src/combat/combat.ts` übernehmen.
4. Führe die Tests aus `docs/modules/kampf.md` aus. Arbeitest du in einem eigenen Worktree/Branch (`modul/kampf`),
   committe dort und schreibe am Ende eine kurze Übergabe: was geändert, welche Schnittstellen betroffen, welche
   Werte der Nutzer in der Arena ausprobieren soll.
