# M31 – Blocken und Ausweichen (Nutzerwunsch)

## Warum?

Der Kampf soll dynamischer werden: neben Hieb und Zauber auch **Blocken** und **Ausweichen** – zuerst in der
Kampf-Arena zum Ausprobieren und Feilen.

## Design

- **Blocken** (Taste halten): Schaden von vorn stark verringert (Regler), Rückstoß kleiner, Bewegung verlangsamt,
  kein Angriff währenddessen. **Parieren:** Block kurz vor dem Treffer gedrückt (Zeitfenster, Regler) → kein
  Schaden, Gegner kurz aus dem Gleichgewicht (wankt). Sichtbar durch einen prozeduralen Schild-/Abwehr-Effekt
  (LPC hat keine Block-Animation).
- **Ausweichen** (Taste antippen): kurzer schneller Sprung/Rolle in Bewegungs- bzw. Zielrichtung (8 Richtungen,
  M28) mit Unverwundbarkeit für einen Teil der Dauer (Regler), Abklingzeit (Regler), Nachbild-Spur als Effekt.
  Kollision mit Gelände bleibt (kein Durchspringen von Wänden).
- **Tasten:** in der Arena ausprobieren und begründet festlegen (Vorschlag: Block = L halten, Ausweichen =
  Leertaste, Angriff bleibt J; Gamepad: LB = Block, B = Ausweichen – dabei Konflikte mit Sprinten/Zoom lösen).
- **Nur in der Arena aktiv** (Schalter in `PlayerCombat`), bis der Nutzer das Gefühl freigibt; danach ins Spiel.
- Alle Werte als Arena-Regler (`src/combat/tuning.ts`), „Werte kopieren“ wie bisher.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Blocken verringert Schaden von vorn, nicht von hinten; Parieren im Zeitfenster verhindert Schaden. | Unit + E2E Arena |
| R2 | Ausweichen bewegt schnell, macht kurz unverwundbar, hat Abklingzeit, geht nicht durch Hindernisse. | Unit + E2E Arena |
| R3 | Regler für alle neuen Werte, gespeichert, als Code kopierbar. | E2E Arena |
| R4 | Kampf in der Welt unverändert (Kampftests grün). | E2E `kampf` |

## Ergebnis

Erreicht (2026-11-01, Branch `modul/kampf-block-ausweichen`), **nur in der Kampf-Arena aktiv** (`PlayerCombat.guardEnabled`,
Arena setzt es; Welt unverändert).

**Tasten (Arena):** J Hieb · K Zauber · **L halten = Block** · **Leertaste = Ausweichen** · WASD laufen.
Begründung: Die rechte Hand liegt auf J/K/L – Angriff, Zauber, Abwehr nebeneinander, Block ist ein Halten mit dem Ringfinger
ohne Umgreifen. Ausweichen ist der hektischste Reflex und bekommt die größte Taste unter dem freien linken Daumen, während
WASD die Richtung gibt. Die Leertaste war in der Arena bisher ein zweiter Hieb (J bleibt); in der Welt bleibt sie
Angriff, bis der Nutzer freigibt.

**Gamepad (nur Vorschlag, nicht umgesetzt – `src/game/gamepad.ts` gehört nicht zum Modul):** LT halten = Block (frei,
„Schild hoch“ mit dem Zeigefinger), **B = Ausweichen** sofort beim Drücken. B ist heute Sprinten (halten) – Sprinten
wandert auf L3 (linken Stick drücken). „B antippen = Ausweichen, halten = Sprinten“ wäre verbreitet, löst aber erst beim
Loslassen aus und widerspräche der Unmittelbarkeit. LB/RB (Zoom) bleiben.

**Regeln und Standardwerte** (`PLAYER_BLOCK`, `PLAYER_DODGE` in `src/combat/combat.ts`, alle als Regler):

| Wert | Standard | Warum |
|---|---|---|
| Block: Schaden von vorn | 0,2 | spürbar geschützt, aber Dauerblock ist kein Freifahrtschein |
| Abwehrwinkel ± | 70° | vorn und schräg vorn (8 Richtungen, M28), seitlich/hinten nicht |
| Parade-Zeitfenster | 0,18 s | Räuber: Ausholen 0,3 s + Schlag 0,18 s – wer beim Schlag (nicht schon beim Ausholen) hebt, pariert; casual-freundlich |
| Block: Tempo | 0,5 | langsames Rückwärtsgehen mit Schild, kein Sprinten im Block |
| Block: Rückstoß | 0,35 | man bleibt im Block stehen |
| Parade: Gegner wankt | 0,8 s | Zeit für 2 Hiebe (Hieb-Zyklus 290 ms) |
| Block hält Richtung | 1 | Schild bleibt beim Rückwärtsgehen vorn (sonst dreht man dem Gegner den Rücken zu) |
| Ausweichen: Tempo / Dauer | 400 px/s / 0,18 s | 72 px ≈ 2¼ Kacheln: aus der Reichweite eines Räuberhiebs (~38 px), kurz genug für Kontrolle |
| Ausweichen: unverwundbar | 0,15 s | fast der ganze Sprung, das Ende (0,03 s) nicht – Timing zählt ein wenig |
| Ausweichen: Abklingzeit | 0,35 s | Zyklus 0,53 s: kein Dauerrollen, aber zwei Sprünge hintereinander gehen |

- Block wirkt sofort, solange L gehalten wird und kein Hieb läuft (kein Vormerken; endet ein Hieb mit gehaltenem L,
  hebt sich der Block dann). Im Block kein Hieb, kein Zauber, kein Sprinten.
- Geblockter Treffer: Schaden × 0,2, kurze Schonzeit 0,3 s (statt 0,8 s), blauer Schimmer. Parade: kein Schaden,
  Funken, „Parade!“, Angreifer (`hurtPlayer(…, source)`) wankt (`Enemy.stagger`, Zustand `stagger`, blau getönt,
  schwankt, kurzer Rückstoß). Drohnen-Geschosse lassen sich blocken/parieren, da wankt niemand.
- Ausweichen in Eingaberichtung (8 Richtungen), ohne Eingabe in Zielrichtung; über `Actor.push` → `moveBox`, also nicht
  durch Wände. Nicht während Hieb oder Rückstoß (dann passiert nichts – kein Vormerken). Nachbild-Spur alle 30 ms.
- Effekte prozedural: flacher Schild-Bogen vor der Figur (im Parier-Fenster gelb und dicker), Funken, Nachbilder.
- Statistik: Blocks, Paraden, Ausweichen, „ausgewichen“ (Treffer im Sprung vermieden).

**Nachweis:** Unit `tests/unit/m31.test.ts` (R1–R3), E2E `arena.spec.ts` › M31 (Block vorn/hinten, Parade mit Wanken,
Ausweichen bewegt/schützt/Wand/Statistik/Regler gespeichert/kopiert), `kampf.spec.ts` grün (R4). Zusätzlich gegen
einen echten angreifenden Räuber geprüft: Dauerblock 3 Blocks bei je ~4 statt ~20 Schaden; L zu Beginn des Schlags →
4 von 4 Paraden; L schon beim Ausholen → zu früh, nur Block (so gewollt).
Screenshots: `screenshots/m31-block.png`, `m31-parade.png`, `m31-ausweichen.png` (nicht versioniert, `npm run shots`).

**Offen / für die Freigabe:** Gefühl durch den Nutzer in der Arena; danach Welt-Tasten (WorldScene) und Gamepad.
