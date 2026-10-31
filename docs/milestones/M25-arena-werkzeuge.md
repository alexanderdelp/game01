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

Erreicht am 2026-10-31 (Branch `modul/kampf-arena-werkzeuge`).

| # | Ergebnis | Nachweis |
|---|---|---|
| R1 | 5 Aufbauten (Offen, Säulen, Wald & Felsen, Engpässe, Sumpf) in `src/arena/layouts.ts` als Daten (Kachelraster Boden/Mauer/Wasser/Sumpf + Dekor mit Kollisionsbox), Arena 40 × 26. Wahl gespeichert (`arena:layout`), Wechsel startet die Szene neu. | `arena.spec.ts` R1, `m25.test.ts` (alle freien Kacheln erreichbar) |
| R2 | Gegner am Boden planen einen Umweg, wenn die gerade Linie versperrt ist (`src/combat/pathing.ts`: Sichtlinie + Breitensuche, alle 0,5 s, max. 600 Kacheln). Gilt auch in der Welt; Flieger unverändert. Ohne Umweg blieb der Räuber im Test an der Mauer stehen. | `arena.spec.ts` R2, Screenshot `m25-arena-chase.png` |
| R3 | Waffe: ohne / Alter Dolch / Dolch gewöhnlich, selten, episch (Stufe 1–20, fester Zufall → wiederholbar). Werte über `finalStats` wie im Heldenfenster (Held Stufe 1 mit seiner übrigen Kleidung), Grafik über `dress`. Wahl gespeichert (`arena:weapon`). | `arena.spec.ts` R3, `m25.test.ts` |
| R4 | Anzahl 1×/3×/5×, Ort zufällig / vor dem Helden / per Klick, „Welle (6 gemischt)“, Gegner-Zähler in der Statistik. Ort und Anzahl gespeichert (`arena:spawn`). | `arena.spec.ts` R4 |
| R5 | Kampftests der Welt grün (`m4-combat`, `m17-feel`, `m14-explore`, Unit-Tests). | E2E |

Weiteres: Mausrad zoomt die Arena (1× / 1,5× / 2×). Screenshots: `screenshots/m25-arena-*.png`.

Entscheidungen:
- Gegner werden im Sumpf **nicht** langsamer: Gegner nutzen `speedAt` bisher gar nicht; das zu ändern hätte den Kampf in
  der Welt (Hänge) verändert. Nur der Held wird gebremst.
- Arena-Held = Stufe 1 ohne Talente, damit allein die Waffe den Unterschied macht. Dadurch ist der Grundangriff jetzt
  15 statt fest 14 (Alter Dolch +1) – genau wie im Spiel.
