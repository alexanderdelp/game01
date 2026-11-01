# Koordination: mit mehreren Agenten weiterentwickeln

Für eine Session, die **koordiniert** (Start mit `/koordinieren` oder „Du bist Koordinator“). Der Nutzer redet nur
mit dem Koordinator (Telegram oder Chat); der Koordinator startet und steuert die Arbeits-Sessions.

## Rollen

| Rolle | Macht | Macht nicht |
|---|---|---|
| **Koordinator** (eine Session) | Wünsche verstehen, Meilenstein + Anforderungen schreiben, in Modul-Aufträge zerlegen, Sessions starten, Ergebnisse prüfen, auf `main` zusammenführen, Gesamttests, Push/Deploy, `CLAUDE.md`/`DESIGN.md` pflegen, Telegram-Updates und Fragen an den Nutzer | selbst große Modularbeit (nur kleine Korrekturen und Knotenpunkte) |
| **Modul-Agent** (je Auftrag eine Session) | im eigenen Worktree/Branch an genau einem Modul arbeiten (Skill `/modul`, Kampf: `/kampf`), testen, committen, Übergabe schreiben | auf `main` committen, pushen, Knotenpunkte ändern, den Nutzer direkt fragen |

## Module

Übersicht und Anleitungen: [README.md](README.md). Kurz: `welt`, `weltenbau`, `inhalte`, `figur`,
`oberflaeche`, `netz`, `kampf`.

**Knotenpunkte** (nur der Koordinator ändert sie, Module beschreiben Wünsche in der Übergabe):
`src/scenes/WorldScene.ts`, `src/main.ts`, `src/world/biomes.ts` (nur additiv), `package.json`,
`tests/e2e/helpers.ts`, `CLAUDE.md`, `docs/DESIGN.md`. Additiv für alle: `src/debug.ts`, `src/scenes/world/worldDebug.ts`.

## Ablauf je Wunsch

1. **Verstehen:** Bei großen optischen Umbauten oder echten Richtungsfragen den Nutzer fragen (Telegram
   `node tools/telegram.mjs ask …`), sonst selbst entscheiden und in `CLAUDE.md` dokumentieren.
2. **Planen:** `docs/milestones/Mxx-<name>.md` mit Ziel, Design, Anforderungstabelle (R1 … mit Nachweis).
   Aufteilen in Aufträge **je Modul**. Zwei Aufträge, die dieselben Dateien ändern, nie parallel.
3. **Starten:** je Auftrag eine Session (Claude-Desktop: `start_session`, eigener Worktree, `context: "fresh"`).
   Höchstens **3 gleichzeitig**. Auftrag nach der Vorlage unten.
4. **Warten:** Die Sessions melden sich selbst zurück; nicht abfragen. Rückfragen der Agenten beantworten
   (`SendMessage` an die Session), Fragen an den Nutzer bündeln.
5. **Prüfen:** Diff der Branches lesen (nicht nur die Übergabe glauben), Tests des Moduls im Worktree grün?
6. **Zusammenführen** nacheinander auf `main` (Reihenfolge: Schnittstellen-Anbieter zuerst, z. B. Welt vor
   Inhalten). Nach **jedem** Merge: `npm run check` (Unit + Build + alle E2E, ca. 4 min, im Hintergrund; Grundsätze in `docs/TESTS.md`).
   Knotenpunkt-Änderungen aus den Übergaben jetzt selbst einbauen.
7. **Abschließen:** Meilenstein-Ergebnis eintragen, `CLAUDE.md` (Entscheidungen, Meilensteinliste) pflegen,
   committen (als `alexanderdelp`, Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), pushen,
   Telegram-Update (Link, 1–4 Screenshots, 3 Punkte). Worktrees aufräumen.

## Vorlage für einen Auftrag

```
/modul <name> <ein Satz Ziel>

Kontext: Meilenstein Mxx (docs/milestones/Mxx-….md), Anforderungen R…
Aufgabe: <was genau, welche Dateien voraussichtlich>
Schnittstellen: <welche bleiben unverändert / welche darf er ändern>
Fertig, wenn: <Tests, die grün sein müssen; Screenshot bei Optik>
Branch: modul/<name>-<thema>. Nicht auf main, nicht pushen. Ende mit Übergabe (Skill /modul, Schritt 6).
```

## Regeln

- **Ein Modul, ein Agent.** Überschneiden sich Dateien, nacheinander statt parallel.
- **Schnittstellen sind Verträge.** Ändert ein Auftrag eine Schnittstelle, kommt er zuerst; abhängige Aufträge
  starten erst nach dem Merge (vom neuen `main`).
- **Gesamttests vor jedem Push.** CI deployt nur bei grünen Tests auf GitHub Pages.
- Der Testbrowser ist gedrosselt (~10 FPS): Abläufe am Spielzustand (`window.__game`) prüfen, nicht an der Uhr.
- Telegram bleibt der Hauptkanal zum Nutzer (`tools/telegram.mjs`, Zugangsdaten nur in
  `~/.config/game01/telegram.env`, nie committen). Beim Start der Session den Posteingang lesen
  (`node tools/telegram.mjs inbox`).
- Kleine Aufgaben (ein paar Tool-Aufrufe) macht der Koordinator selbst – eine Session lohnt sich erst für echte
  Modularbeit.

## Ohne Desktop-App (von Hand)

```bash
git worktree add ../game01-welt -b modul/welt-<thema> && cd ../game01-welt && npm ci
claude "/modul welt <auftrag>"
```

Zusammenführen dann wie oben; `git worktree remove ../game01-welt` danach.
