# M3 – Sich bewegende, neutrale NPCs in der Welt

## Ziel

Die Welt ist nicht leer: Menschen ziehen umher, passend zur Gegend (Jäger im Wald, Kristallsucher im
Kristallhain, Schrottsammler in der Ödnis …). Man kann sie ansprechen und erfährt etwas über sie.

## Design

- **Seed-basiertes Auftreten:** Pro Chunk wird deterministisch entschieden, ob und welche NPCs dort „zu Hause“ sind
  (abhängig vom Biom). Gleicher Seed → gleiche Personen an gleichen Orten, mit gleichem Namen und Aussehen.
- **Rollen** je Biom (z. B. Wanderer, Jägerin, Kristallsucher, Schrottsammlerin, Nomade, Hirte, Fischer, Eremit).
  Jede Rolle hat eigene Sätze (Deutsch) – die Welt erzählt so schon kleine Geschichten.
- **Aussehen:** Pro Welt werden 16 Archetypen aus den LPC-Ebenen erzeugt (Körper, Hautton inkl. Fantasy-Töne, Haare,
  Kleidung, Farben). NPCs nutzen einen davon → abwechslungsreich, aber speicherschonend.
- **Namen:** seed-basiert aus Silben (Fantasy- und Cyber-Anteile, z. B. „Kael Voss“, „Mira-7“).
- **Verhalten (Wandern):** Zustandsautomat Stehen ↔ Gehen. Ziel: zufällige begehbare Stelle im Umkreis von 6 Kacheln um das Zuhause.
  Gleiche Kollision wie der Spieler. Wird ein NPC angesprochen, bleibt er stehen und schaut den Spieler an.
- **Lebenszyklus:** NPCs erscheinen mit ihrem Chunk und verschwinden, wenn er entladen wird (dauerhafte Simulation: M10).
- **Ansprechen:** E / Leertaste (oder antippen) in der Nähe → Dialogfenster mit Name, Rolle und einem Satz. Nochmal drücken → nächster Satz / schließen.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | NPC-Auftreten ist deterministisch aus Seed und Chunk. | Unit |
| R2 | NPCs erscheinen nur auf begehbarem Land, Rollen passen zum Biom. | Unit |
| R3 | NPCs bewegen sich selbstständig (Wandern) mit Animation und Kollision. | E2E |
| R4 | NPCs bleiben im Umkreis ihres Zuhauses. | Unit (Zielwahl) |
| R5 | Ansprechen per Taste/Antippen zeigt Name, Rolle und Text; NPC dreht sich zum Spieler. | E2E |
| R6 | Unterschiedliche Aussehen (Archetypen) und Namen. | Unit + Screenshot |
| R7 | Leistung bleibt flüssig (NPCs nur in geladenen Chunks). | E2E (FPS-Stichprobe) |

## Ergebnis

Erreicht am 2026-10-30. R1, R2, R4, R6 per Unit-Test (`tests/unit/m3.test.ts`), R3, R5 per Akzeptanztest
(`tests/e2e/m3-npcs.spec.ts`), R6/R7 per Screenshot.

Anpassungen während der Umsetzung:
- NPC-Dichte an die kleineren Chunks (16 × 16 Kacheln seit M2) angepasst: bis zu 3 Versuche pro Chunk, Wahrscheinlichkeit je Biom.
- NPCs erscheinen nie auf blockierenden Dekorationen; wer dennoch feststeckt (Spieler oder NPC), darf sich frei herausbewegen.
- `Player` wurde zu `Actor` verallgemeinert (Spieler und NPCs teilen Bewegung, Kollision und Animation).
- Touch: Button „Reden“ statt Antippen des NPCs (einfacher und zuverlässiger mit dem virtuellen Stick).
