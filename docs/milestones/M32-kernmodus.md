# M32 – Kernmodus (Plan „Kern geradeziehen“, Phase 0)

## Warum?

Zu viele unfertige Systeme lenken vom Kern ab (`docs/PLAN-kern.md`). Kern des Spiels ist **Spaß an der Erkundung**,
zuerst müssen Bewegen und Kämpfen Spaß machen. Alles andere wird vorübergehend abgeschaltet, nicht gelöscht.

## Design

- **Schalter je System** in `src/game/features.ts`. Standard ist der **Kernmodus**: die folgenden Systeme sind aus.
  - `quests` – Aufträge der NPCs (Angebote, `!`/`?`, Tracker, Questlog, Botengänge)
  - `pledge` – Treueschwur beim Herrscher (Rabatt, Handelsverbot der Rivalen, Einfluss auf Reichsmacht)
  - `caravans` – Karawanen
  - `invasions` – Invasionen von Gegnern in Reiche
  - `news` – Neuigkeiten und „Während du weg warst“
  - `renown` – Ansehen und Wohlstand (Rabatt, Grüße, wachsende Orte, Statue)
- **Bleibt an:** Gelände, Sicht, Fog of War, Karte/Minimap, Wegweiser-Pfeil zum nächsten unentdeckten Ort, Truhen,
  Ruinen, Schreine, Obelisken mit Chronik, NPCs als Kulisse (Plaudern, Händler, Barbier), Kampf, Stufen/Beute,
  Wetter und Tageszeit, Teilen/Sync/Live.
- **URL:** `?systeme=alle` schaltet alles ein, `?systeme=quests,news` nur die genannten; ohne Angabe Kernmodus.
  Nicht gespeichert (Kernmodus ist der Normalfall).
- Abgeschaltete Systeme hinterlassen nichts Halbes: keine Menüeinträge, Marker oder Hinweise, die ins Leere zeigen.
  Gespeicherte Daten (laufende Quests, Schwüre) bleiben unangetastet und sind beim Wiedereinschalten wieder da.
- Automatische Tests der abgeschalteten Systeme laufen mit `?systeme=alle` weiter.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Ohne Angabe sind die sechs Systeme aus; `?systeme=alle` / Liste schaltet ein. | Unit |
| R2 | Im Kernmodus: keine Quest-Angebote/Marker/Tracker, Herrscher bietet keinen Schwur, keine Karawanen und Invasionen, keine Neuigkeiten, kein Rabatt durch Ansehen; Menü ohne Quests/Neuigkeiten. | E2E `oberflaeche` |
| R3 | Mit `?systeme=alle` verhält sich das Spiel wie bisher (alle bisherigen Tests grün). | E2E gesamt |
| R4 | Systemkarte in `docs/PLAN-kern.md` geprüft. | Doku |

## Ergebnis (2026-11-20)

- `src/game/features.ts`: Schalter, `?systeme=` auswerten, `on(feature)`; eingeschaltete Systeme in `window.__game.features`.
- Eingehängt in `WorldTalk` (Quests, Schwur, Ansehen, Marker), `LiveWorld` (Karawanen, Invasionen, Einfluss von Schwur
  und Ansehen auf die Reichsmacht), `TownDecor` (Wohlstand), `HeroController` (Quest-Fortschritt, Quest-Beute),
  `WorldScene` (Neuigkeiten, Quest-Orte) und `UIScene` (Menü, Tasten L/U, Tracker, Einstiegshinweise).
- Einstiegshinweise im Kernmodus: kein „Gelbes !“, der gelbe Pfeil führt zum nächsten unentdeckten Ort.
- Tests: Unit `m32.test.ts` (R1); E2E `weltenbau` › M32 und `oberflaeche` › Titel im Kernmodus (R2); alle übrigen
  E2E-Tests laufen mit `?systeme=alle` (`open(page, seed, systeme)`) und sind grün (R3).
- Systemkarte in `docs/PLAN-kern.md` gegen den Code geprüft (R4).
