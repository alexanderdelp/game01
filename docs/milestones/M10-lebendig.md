# M10 – Lebendigkeit der Welt ohne Spieleraktionen

## Ziel

Die Welt läuft weiter, auch wenn niemand spielt: Tag und Nacht, Wetter, Karawanen auf Reisen, Reiche, die wachsen und
schrumpfen, Invasionen, Orte, die aufblühen oder darben. Wer zurückkommt, erfährt, was passiert ist.

## Grundprinzip: Simulation als Funktion der Zeit

Alles ist eine reine Funktion aus **Seed + Weltzeit (echte Uhrzeit)** – kein Server nötig, kein „Nachrechnen“ Tick
für Tick, und (wichtig für M11) alle Spieler sehen dieselbe Welt zur selben Zeit. Spielerhandlungen aus dem
Weltzustand (M9) fließen als Einfluss ein (Ansehen stärkt Reiche, Quests stärken Orte).

- **Weltzeit:** 1 Spieltag = 24 echte Minuten; 1 Simulationsschritt („Tick“) = 1 echte Stunde.

## Systeme

| System | Verhalten | Sichtbar |
|---|---|---|
| Tag & Nacht | Licht von Morgengrauen bis Nacht | Farbton über der Welt, Uhrzeit im HUD |
| Wetter | je Reich und Stunde: klar, Regen/Schnee, Nebel, Sturm | Partikel/Nebel, Anzeige im HUD |
| Karawanen | ziehen zwischen Orten hin und her (Position aus der Zeit) | Händler-NPC in der Welt (handelbar), Punkte auf der Karte |
| Reichsmacht | langsames, seed-basiertes Auf und Ab je Reich (+ Ansehen) | Grenzen verschieben sich über Tage (Karte) |
| Wohlstand | Orte schwanken von selbst (+ Quests aus M9) | Laternen/Häuser/Statue (M9-Darstellung) |
| Invasionen | in einem Reich ist für eine Stunde eine Gegnerart doppelt so häufig | Banner beim Betreten, mehr Gegner |
| Neuigkeiten | Ereignisse je Tick (Grenzverschiebung, Invasion, Karawane, Fest …) | „Während du weg warst …“ beim Start, Nachrichten-Fenster (**U**, Touch: „News“) |

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Simulation ist deterministisch aus Seed und Zeit; gleiche Zeit → gleicher Zustand. | Unit |
| R2 | Tag/Nacht und Wetter ändern sich mit der Zeit. | Unit + Screenshot |
| R3 | Karawanen bewegen sich über die Zeit zwischen zwei Orten über Land. | Unit + E2E |
| R4 | Reichsmacht verschiebt Grenzen; Ansehen wirkt mit. | Unit |
| R5 | Invasionen erhöhen die Gegnerdichte im betroffenen Reich. | Unit |
| R6 | Beim Start nach Abwesenheit erscheint eine Zusammenfassung der Ereignisse. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1–R6 per Unit-Test (`tests/unit/m10.test.ts`) und Akzeptanztest (`tests/e2e/m10-live.spec.ts`),
Tag/Nacht und Wetter per Screenshot.

Anpassungen während der Umsetzung:
- `sim/simulation.ts` (rein) + `sim/LiveWorld.ts` (Einbindung). Reichsmacht gewichtet die Reichsgrenzen (`WorldMeta.powers`).
- Karawanen sind von außen gesteuerte NPCs (Händlerdialog), Position ausschließlich aus der Weltzeit.
- Invasionen: `enemiesForChunk` erhält die aktuelle Invasion; betroffene Gebiete haben doppelte Gegnerdichte einer Art.
- Für Tests und Vorschau lässt sich die Weltzeit verschieben (`__game.timeOffset`).
