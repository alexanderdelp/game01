# M23 – Aussehen aus Ausrüstung (Nutzerwunsch)

## Warum?

Farbwahl im Charaktereditor wirkt „gamy“. Kleidung und ihre Farben sollen sich aus der angelegten Ausrüstung
ergeben; der Editor bestimmt nur, wer man ist. Entscheidungen und Ideen: `docs/VORSCHLAG-aussehen-voelker.md`.

## Design

- **Editor:** Volk, Körper (nicht beim Synth – kein Geschlecht), Haut, Frisur, Haarfarbe, **Volksmerkmal**
  (Elf: Augenfarbe, Synth: Leuchtfarbe für Augen und Panzerfugen; Mensch und Ork: keines). Keine Kleidungszeilen.
  Die Vorschau zeigt die Startausrüstung des Volks. Beim Barbier: nur Frisur und Haarfarbe.
- **Kleidung als Einzelteile:** Plätze Waffe, Oberkörper, Beine, Füße, Amulett. Jedes Kleidungsteil hat Schnitt und
  Farbe (Hemd-Schnitte, Leder, **Plattenpanzer** in Metallfarben, Hose, Schuhe, Stiefel) und Boni.
  Alles Getragene ist sichtbar (auch die Waffe); Amulette nicht.
- **Leere Plätze:** Leinen-Unterkleidung (Ork-Männer mit freiem Oberkörper), barfuß, ohne Waffe.
- **Startausrüstung je Volk:** Mensch Leinenhemd/-hose/Schuhe; Elf Waldläufer-Tunika, Lederhose, weiche Stiefel; Ork
  Fellweste, grobe Hose, schwere Stiefel; Synth Grundpanzerung. Alle mit „Altem Dolch“. Ältere Helden bekommen
  fehlende Teile einmalig nachgereicht.
- **Synth:** Panzerplatten sind der Körper; ihre Metallfarbe kommt von angelegtem Plattenpanzer, Leuchtlinien in der
  Volksfarbe. Andere Kleidung ist beim Synth (noch) unsichtbar – Idee: „Panzer-Module“.
- Symbole im Inventar sind in der Farbe des Gegenstands getönt.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Ausrüstung bestimmt Oberteil, Hose, Schuhe samt Farbe; leere Plätze sinnvoll. | Unit + E2E |
| R2 | Plattenpanzer in Metallfarbe, auch für Synth; Synth ohne Geschlecht. | Unit |
| R3 | Volksmerkmale: Elf Augenfarbe, Synth Leuchtfarbe. | Unit + E2E |
| R4 | Neuer Held trägt die Startausrüstung seines Volks; Anlegen/Ablegen ändert das Aussehen sofort. | E2E |

## Ergebnis

Erreicht am 2026-10-31: `tests/unit/m23.test.ts`, `tests/e2e/m23-outfit.spec.ts`, angepasst `m18`.
Offen als Ideen: Fraktionsfarben bei Händlern, Seltenheit sichtbar (Säume, Beschläge), Umfärben beim Schneider,
Rüstungsgrenzen je Volk, Panzer-Module beim Synth, Kriegsbemalung beim Ork, Kopfbedeckungen.
