# M7 – Questing-Mechaniken

## Ziel

NPCs vergeben Aufträge, die zur Rolle und Gegend passen. Aufträge führen durch die Welt (Kampf, Sammeln, Botengänge,
Erkundung) und belohnen mit EP, Splittern und Ausrüstung. Einfach zu verstehen, immer klar, was als Nächstes zu tun ist.

## Design

### Quest-Arten
| Art | Beispiel | Ziel |
|---|---|---|
| Jagd | „Die Schleime fressen meine Weide kahl. Erledige 5.“ | n Gegner einer Art besiegen |
| Sammeln | „Bring mir 3 Altteile von Drohnen.“ | Questgegenstände, die nur während der Quest von bestimmten Gegnern fallen |
| Botengang | „Bring diesen Brief zu Mira Voss im Nordosten.“ | einen bestimmten anderen NPC ansprechen |
| Erkundung | „Man erzählt von einem Kristallhain im Süden. Sieh nach!“ | einen Ort (Biom-Fundstelle) erreichen |

- **Vergabe:** Seed-basiert pro NPC und laufender Nummer → gleicher NPC, gleiche Quest-Reihe. Rolle bestimmt die Arten
  (Jäger → Jagd, Schrottsammler → Sammeln, Fischer → Botengang, Eremit → Erkundung …).
- **Ziele** liegen in der Nähe (Botengang/Erkundung: 3–10 Chunks entfernt), Richtung wird als Himmelsrichtung genannt.
- **Belohnung** skaliert mit der Stufe des Helden; mit 35 % Chance zusätzlich ein Gegenstand.
- Höchstens 5 aktive Quests. Abbrechen jederzeit möglich (casual).
- Nach Abgabe bietet der NPC nach einer Weile die nächste Quest seiner Reihe an.

### Bedienung
- **Gespräch:** Bei NPCs mit Angebot erscheint ein gelbes **!**, bei abgabebereiten Quests ein grünes **?**.
  Ansprechen zeigt das Angebot mit **[1] Annehmen / [2] Ablehnen** (Touch: Buttons).
- **Questlog** (L, Touch: „Quests“): aktive Quests mit Fortschritt, Abbrechen.
- **HUD-Tracker:** wichtigste aktive Quest mit Fortschritt; **Richtungspfeil** am Bildschirmrand zu Ort/Person (inkl. Entfernung).
- Gespeichert im Heldenstand der Welt.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Quests sind seed-basiert pro NPC und Index, passen zur Rolle, Ziele sind erreichbar (begehbar / existierender NPC). | Unit |
| R2 | Fortschritt: Kills, Questgegenstände, Ansprechen des Ziel-NPCs, Erreichen des Orts. | Unit |
| R3 | Annehmen, Abgeben (Belohnung), Abbrechen, max. 5 aktiv. | Unit + E2E |
| R4 | Marker (!/?), Tracker und Richtungspfeil sind sichtbar. | Screenshot |
| R5 | Quests überstehen Neuladen. | E2E |

## Ergebnis

Erreicht am 2026-10-30/31. R1–R3 per Unit-Test (`tests/unit/m7.test.ts`), R3, R5 per Akzeptanztest (`tests/e2e/m7-quests.spec.ts`),
R4 per Screenshot.

Anpassungen während der Umsetzung:
- Botengänge werden direkt beim Empfänger abgeschlossen (kein Rückweg nötig – casual).
- Der Richtungspfeil sitzt auf einem Kreis um die Figur statt am Bildschirmrand (überdeckt keine Anzeigen, gut am Handy).
- Questgegenstände fallen nur, solange die passende Sammelquest aktiv ist, und haben ein eigenes Symbol.
