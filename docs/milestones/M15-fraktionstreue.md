# M15 – Fraktionstreue (zusätzlicher Meilenstein)

## Warum?

Der Wunsch „Relevante Entscheidungen: Handlungen prägen die Welt dauerhaft“ war bisher über Taten (Quests, Truhen,
Ansehen) erfüllt – eine echte **Entscheidung mit Vor- und Nachteilen** fehlte noch.

## Design

- In jeder **Hauptstadt** steht ein **Herrscher** (eigene Rolle). Er bietet einen **Treueschwur** an.
- Jedes Reich hat einen **Erzrivalen** (seed-basiert, aus der Chronik: die zwei verfeindeten Reiche und weitere Paare).
- **Schwur** (Weltzustand, für alle Spieler sichtbar):
  - Das Reich gewinnt dauerhaft an Macht (+0,12 je Held) → Grenzen wachsen auf der Karte.
  - Händler dieses Reichs geben zusätzlich 15 % Rabatt.
  - Der **Rivale** verliert an Macht (−0,06), und seine Händler **verweigern** den Handel.
  - Titel „Gefolgsmann von …“ im Heldenfenster.
- Man kann den Schwur bei einem anderen Herrscher **wechseln** (der neue gilt, der alte erlischt) – eine Entscheidung,
  aber keine Falle (casual).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Rivalen sind seed-basiert und symmetrisch; Schwüre im Weltzustand, je Held nur der letzte gültig. | Unit |
| R2 | Schwur verändert Reichsmacht (Gewinner/Rivale). | Unit |
| R3 | Herrscher in der Hauptstadt, Schwur per Dialog, Rabatt bzw. Handelsverweigerung beim Rivalen. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1, R2 per Unit-Test (`tests/unit/m15.test.ts`), R3 per Akzeptanztest (`tests/e2e/m15-pledge.spec.ts`).

- Rivalenpaare entstehen seed-basiert (eigener Zufallsstrom, damit der Rest der Welt gleich bleibt); der Krieg in der
  Chronik ist nun der Streit eines dieser Paare.
- Herrscher tragen ein gelbes „!“, solange man ihrem Reich nicht die Treue geschworen hat.
- Schwüre sind Ereignisse im Weltzustand → werden geteilt; Mitspieler sehen in den Neuigkeiten, wem man folgt.
