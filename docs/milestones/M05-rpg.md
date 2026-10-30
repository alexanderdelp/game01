# M5 – Charakter-RPG-Mechaniken (Werte, Ausrüstung, Progression)

## Ziel

Die Figur wird spürbar stärker: Erfahrung sammeln, aufsteigen, Talente wählen, Beute finden und anlegen.
Bewusst einfach (casual), aber mit echten Entscheidungen.

## Design

### Werte & Stufen
- **Grundwerte:** LP, Angriff, Verteidigung, Tempo. Endwerte = Grundwerte (Stufe) + Talente + Ausrüstung.
- **Erfahrung (EP):** Gegner geben EP nach Art und Stufe. Benötigte EP: `round(20 · Stufe^1.6)` bis zur nächsten Stufe.
- **Aufstieg:** +8 LP, +2 Angriff, +1 Verteidigung, volle Heilung, Effekt „Stufe X!“, **1 Talentpunkt**.
- **Talente (je Punkt):** *Kraft* (+3 Angriff), *Zähigkeit* (+15 LP), *Flinkheit* (+6 % Tempo). Frei verteilbar im Heldenfenster.

### Beute & Währung
- **Splitter** (Kristallsplitter, die Währung zwischen Magie und Maschine) fallen immer.
- **Gegenstände** fallen mit ~25 % Chance, **Heiltränke** mit ~15 %. Liegen am Boden, Aufheben durch Drüberlaufen.
- **Seltenheit:** gewöhnlich (weiß), selten (blau), episch (lila) → mehr Bonuswerte und ein Beiname.
- **Namen:** Grundtyp + Präfix + Beiname, Fantasy/Cyber gemischt (z. B. „Neon-Klinge des Fuchses“, „Runen-Harnisch“).
- Gegenstandsstufe folgt der Gegnerstufe → weiter draußen bessere Beute.

### Ausrüstung
- **Plätze:** Waffe (Angriff), Rüstung (Verteidigung, LP), Amulett (gemischt: LP, Tempo, Regeneration).
- **Rüstungsart ist sichtbar:** Tunika ↔ Lederrüstung wechselt das LPC-Oberteil der Figur.
- Inventar mit 24 Plätzen; Gegenstand antippen → Details mit Buttons „Anlegen“ und „Wegwerfen“; angelegte Gegenstände antippen = ablegen.
- **Heiltrank:** Q (Touch: Button „Trank“) heilt 50 % LP.

### Speichern
- Fortschritt (Stufe, EP, Talente, Inventar, Ausrüstung, Splitter, Tränke) wird pro Welt lokal gespeichert – sonst wäre
  „kurz rein, wieder raus“ frustrierend. (Weltzustand bleibt M9.)

### Oberfläche
- HUD: LP-Leiste, EP-Leiste mit Stufe, Splitter, Tränke.
- **Heldenfenster** (C / I, Touch: „Held“): Werte, Talentpunkte, Ausrüstung, Inventar.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | EP-Kurve, Aufstieg mit Wertzuwachs und Talentpunkt. | Unit |
| R2 | Talente und Ausrüstung verändern die Endwerte korrekt. | Unit |
| R3 | Beute ist seed-/zufallsbasiert, Seltenheit und Stufe beeinflussen Werte, Namen werden erzeugt. | Unit |
| R4 | Besiegte Gegner geben EP und lassen Beute fallen, die man aufheben kann. | E2E |
| R5 | Heldenfenster: anlegen, ablegen, wegwerfen, Talent verteilen. | E2E |
| R6 | Rüstungsart ändert das Aussehen der Figur. | Screenshot |
| R7 | Fortschritt bleibt nach Neuladen erhalten. | E2E |
| R8 | Heiltrank heilt. | Unit + E2E |

## Ergebnis

Erreicht am 2026-10-30. R1–R3, R8 per Unit-Test (`tests/unit/m5.test.ts`), R4, R5, R7, R8 per Akzeptanztest
(`tests/e2e/m5-rpg.spec.ts`), R6 per Screenshot.

Anpassungen während der Umsetzung:
- Reine Logik in `rpg/items.ts` und `rpg/progression.ts`; `entities/HeroController.ts` verbindet sie mit Szene, Figur und Speicher.
- Beutesymbole (Splitter, Trank, Dolch, Tunika, Lederrüstung, Amulett) werden prozedural erzeugt.
- Touch-Buttons umbrechen in mehrere Zeilen, wenn der Platz nicht reicht.
