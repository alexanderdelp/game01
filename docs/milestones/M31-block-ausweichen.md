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

_offen_
