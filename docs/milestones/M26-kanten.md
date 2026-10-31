# M26 – Saubere Höhenkanten (Nutzerwunsch)

## Warum?

Feedback 2026-10-31 (Screenshot Schneegebirge): Bäume und Felsen stehen direkt auf Höhenkanten – das sieht
falsch aus. Und Klippen, die **vom Betrachter weg** abfallen (tiefere Ebene liegt nördlich), sind oft kaum zu
erkennen: Sie bestehen nur aus einer schwach aufgehellten, treppig-gestrichelten Linie.

## Design

- **Abstand statt Verdeckung:** Ein Objekt nahe einer weg abfallenden Klippe müsste teilweise von der Klippe
  verdeckt werden (es steht ja tiefer). Das sauber zu zeichnen (Tiefensortierung gegen das Bodenbild) ist
  aufwendig und fehleranfällig. Stattdessen: **Keine Bäume, Büsche, Felsen auf oder dicht an Höhenkanten.**
  `decorationAt` lässt eine Kachel frei, wenn in ihrem Umkreis (Fußpunkt + Kronen-/Steinbreite, mind. 1 Kachel,
  Richtung Norden etwas mehr, weil hohe Objekte dorthin ragen) eine andere Stufe liegt oder eine Felswand/Treppe
  beginnt. Flache Dinge (Grasbüschel, Blumen) dürfen näher heran. Ergebnis: Kanten bleiben frei und lesbar,
  Objekte stehen nie halb über einem Abgrund.
- **Weg abfallende Klippen deutlicher:** Die Oberkante einer nach Norden abfallenden Stufe bekommt eine
  echte Abbruchkante: helle Lippe auf der oberen Seite, darunter ein schmales Felsband (Felsfarbe des Bioms,
  2–4 px) und ein dunkler Schatten auf der tieferen Seite. Die Kante soll als zusammenhängende Linie wirken,
  nicht als gestrichelte Treppe (Ecken der Zellen weich verbinden). Seitliche Kanten (Ost/West) bekommen
  dieselbe Sprache in schmal, damit alle Kanten wie eine Familie aussehen.
- Alles bleibt im Modul Welt; Schnittstellen unverändert.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Kein Baum, Busch, Fels/Findling auf oder unmittelbar an einer Stufenkante, Felswand oder Treppe. | Unit (viele Stichproben im Gebirge) |
| R2 | Weg abfallende Klippen auf Vorher/Nachher-Bildern klar als Abbruch erkennbar (Schnee-, Tundra- und normales Gebirge). | `preview-area`-Bilder |
| R3 | Dekor-Dichte im Flachland unverändert; Chunk im Worker weiterhin < 150 ms. | Unit / Messung |
| R4 | Bisherige Welt-Tests grün. | Unit + E2E |

## Ergebnis

_offen_
