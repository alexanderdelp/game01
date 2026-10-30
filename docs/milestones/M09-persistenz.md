# M9 – Persistenz von Entscheidungen & Handlungen

## Ziel

Was der Spieler tut, bleibt in der Welt – sichtbar und spürbar. Grundlage dafür ist ein **Weltzustand als
Ereignisprotokoll** (Abweichungen vom Seed), der später (M11) zwischen Spielern geteilt werden kann.

## Design

### Weltzustand
- `WorldState` = Seed + **Ereignisprotokoll** (append-only, mit Zeit und Urheber). Daraus wird der aktuelle Zustand
  abgeleitet (rein, testbar): geöffnete Truhen, besiegte Gegner, entdeckte Orte, Wohlstand der Orte, Ansehen in Reichen.
- Getrennt vom **Helden** (Figur, Inventar, Quests): Die Welt gehört allen, der Held dem Spieler (wichtig für M11).
- Speicherung lokal (`localStorage`) hinter einer kleinen Schnittstelle (`WorldStore`), damit M11 ein Server-Backend
  einsetzen kann. Protokoll wird verdichtet (alte Kills fallen weg), Version für spätere Migrationen.

### Was dauerhaft wird
| Handlung | Dauerhafte Folge |
|---|---|
| Truhe öffnen | bleibt offen (für alle) |
| Gegner besiegen | bleibt 20 min weg, auch nach Neuladen |
| Ort betreten | **Wegstein** aktiviert → Schnellreise über die Karte |
| Obelisk lesen | Fundort auf der Karte, „entdeckt von …“ |
| Quest für Bewohner eines Orts | **Wohlstand** des Orts steigt → Ort verändert sich sichtbar: Laternen (2), Banner und neue Häuser (5), **Statue des Helden** auf dem Platz (10) |
| Quests/Kämpfe in einem Reich | **Ansehen** beim Reich steigt → Rabatt bei Händlern (bis 30 %), Begrüßung und Titel („Freund von …“, „Held von …“) |

### Bedienung
- Karte: entdeckte Orte sind anklickbar → Schnellreise (casual: große Welt, kurze Sitzungen).
- Heldenfenster zeigt Ansehen je Reich.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Ereignisse → abgeleiteter Zustand (Truhen, Kills mit Ablauf, Entdeckungen, Wohlstand, Ansehen) rein und deterministisch. | Unit |
| R2 | Protokoll wird gespeichert, verdichtet und beim Laden wiederhergestellt (inkl. Migration alter Truhen aus M8). | Unit + E2E |
| R3 | Wohlstand verändert Orte sichtbar (Laternen, Häuser, Statue mit Heldennamen). | Screenshot + E2E |
| R4 | Ansehen gibt Händlerrabatt und Titel. | Unit + E2E |
| R5 | Schnellreise zu entdeckten Orten über die Karte. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1, R2, R4 per Unit-Test (`tests/unit/m9.test.ts`), R2–R5 per Akzeptanztest (`tests/e2e/m9-persist.spec.ts`),
R3 per Screenshot.

Anpassungen während der Umsetzung:
- `state/worldState.ts`: Ereignisprotokoll mit Urheber (`by`) und Zeit – bereit zum Teilen in M11. `WorldStore`-Schnittstelle
  mit lokaler Umsetzung.
- Geöffnete Truhen wanderten aus dem Heldenstand (M8) in den Weltzustand (automatische Übernahme beim Laden).
- `render/TownDecor.ts` zeigt den Wohlstand (Laternen, Reichsbanner, neue Häuser, Statue mit Heldennamen) mit eigenen Hindernissen.
- Wegsteine aktivieren sich beim Betreten eines Orts; Schnellreise per Klick auf der Karte.
