# M25 – Arena-Werkzeuge (Nutzerwunsch)

## Warum?

Der Nutzer will in der isolierten Kampf-Arena (`?arena=1`) am Action-Kampf feilen. Dafür fehlen: Gelände mit
Hindernissen (Bewegen, Ausweichen, Gegner um Ecken locken), die Wahl der Waffe und gezieltes Einsetzen von Gegnern.

**Feststellung:** Im Spiel gibt es bisher nur **einen Waffentyp** (Dolch; „Dolch“, „Klinge“, „Messer“ unterscheiden
sich nur im Angriffswert). Nutzerentscheidung 2026-10-31: **erst nur die Arena** – Waffenwahl aus den vorhandenen
Waffen und Werten; echte neue Waffentypen (Schwert, Speer, Bogen …) später als eigener Meilenstein.

## Design

- **Gelände:** Arena größer (ca. 40 × 26 Kacheln) und mit wählbaren **Aufbauten** (Bedienfeld, gespeichert):
  „Offen“, „Säulen“ (bisher), „Wald & Felsen“ (verstreute Bäume/Felsen aus dem Dekor-Atlas, unterschiedlich groß),
  „Engpässe“ (Mauern mit Durchgängen, Korridor), „Sumpf“ (langsamer Boden über `speedAt`, Wasser als Hindernis).
  Hindernisse sind Daten (Liste von Boxen + Grafik), daraus folgen `blocked` und `isWalkable` – keine Sonderfälle
  in der Gegner-KI. Gegner müssen um Hindernisse herumfinden (wie in der Welt).
- **Waffe:** Auswahl im Bedienfeld: „ohne Waffe“, „Alter Dolch“ (Start), sowie Dolch-Varianten aus `generateItem`
  (gewöhnlich / selten / episch, Stufe per Regler). Die Werte der Waffe (Angriff, Tempo) wirken auf den Helden
  der Arena genauso wie im Spiel (gleiche Rechnung wie das Heldenfenster), die Grafik wechselt mit (Dolch / keine
  Waffe). Werte der gewählten Waffe sichtbar.
- **Gegner:** Je Art einsetzen wie bisher, zusätzlich **Anzahl** (1/3/5), **Ort** (zufällig / vor dem Helden /
  per Klick in die Arena), **Welle** (gemischte Gruppe), Stufe und Elite wie bisher. Gegner-Zähler im Bedienfeld.
- Alles bleibt im Modul Kampf (`src/arena`); `CombatTerrain`, `CombatCtx` und Szenen-Ereignisse unverändert.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Mindestens 4 Gelände-Aufbauten wählbar, bleiben nach Neuladen erhalten; Held und Gegner kommen nicht durch Hindernisse. | E2E |
| R2 | Gegner verfolgen den Helden auch um Hindernisse herum (bleiben nicht dauerhaft an einer Wand hängen). | E2E / Screenshot |
| R3 | Waffe wählbar (ohne / Start / gewöhnlich / selten / episch, Stufe); Angriff des Helden folgt der Waffe; Grafik wechselt. | E2E |
| R4 | Gegner nach Art, Anzahl, Ort (zufällig / vorne / Klick) und als gemischte Welle einsetzbar. | E2E |
| R5 | Kampf in der Welt unverändert (bisherige Kampftests grün). | E2E |

## Ergebnis

_offen_
