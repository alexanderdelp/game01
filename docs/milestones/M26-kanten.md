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

Erreicht (2026-10-31, Modul Welt, Branch `modul/welt-kanten`).

- **Abstand zu Kanten (R1):** `terrain.edgeNear(w, px, py, rx, up, down)` prüft ein Rechteck um den Fußpunkt auf dem
  4-px-Zellraster (wie `buildCells`) auf Stufenwechsel und auf Felswände, die von weiter nördlich hineinreichen.
  Ohne Zerklüftung in der Nähe sofort `false` (Flachland kostet nur ein paar `ground`-Abfragen). Stufen je Zelle
  werden zwischengespeichert, weil benachbarte Dekorationen fast dieselben Zellen prüfen.
  `WorldGen.decorationAt` nutzt es statt des bisherigen `wallAt`-Ausschlusses, Freiraum je Art (`CLEAR`):
  Bäume 28–32 px seitlich, 48 px nach Norden, 24 px nach Süden; junge Bäume/Kakteen 36 px nach Norden;
  Felsen, Büsche 24 px / 32 px; Findlinge 32 px breit; Büschel/Blumen nur 8 px.
  Treppen liegen nur auf Pfaden, wo es ohnehin kein Dekor gibt.
- **Ausgleich:** Ohne Ausgleich sank die Dekor-Dichte im zerklüfteten Gebirge von 7,0 % auf 3,2 % der Kacheln.
  Wo `rug > 0`, ist die Dichte jetzt ×1,5: Die Terrassen sind etwas dichter, die Kanten frei (Stichprobe ≈ 5 %).
- **Abbruchkanten (R2):** `ChunkPainter.dropEdge` zeichnet Kanten, deren tiefere Seite nördlich oder seitlich
  liegt: auf der oberen Seite dunkle Bruchlinie (1 px), Felsband in Biom-Felsfarbe (`ROCK`/`ROCK_COLD`, ~2,5 px)
  und helle Lippe; auf der tieferen Seite Schatten (bis 5 px). Seitliche Kanten genauso, aber schmaler.
  Der Abstand wird zu den **Zellmitten** gemessen statt zu den Zellgrenzen, dadurch eine durchgehende Linie mit
  weichen Ecken statt der gestrichelten Treppe. Die Stufen der Nachbar-Chunks (2 Zellen Rand) werden mitberechnet,
  damit an Chunkgrenzen keine Nähte entstehen; je Zelle wird vorab vermerkt, ob überhaupt eine Kante nahe ist.
- **WORLD_VERSION bleibt 3:** Nur Pflanzen und Steine und das Bodenbild ändern sich. Gelände, Kollision, Biome,
  Orte, Truhen, Schreine und Ruinen bleiben gleich, Spielstände bleiben gültig. NPC- und Gegner-Platzierung meidet
  Dekor-Kacheln und kann sich im Gebirge minimal verschieben, das ist unkritisch.
- **Laufzeit (R3):** Chunk (`chunk()` + `paintWithCells`, 25 Chunks, Rechner unter Last ~10,7) vorher/nachher in ms:
  Schnee 110/114, Tundra 111/125, Gebirge 116/129, Flachland 115/117. Alles < 150 ms.
  Davon `chunk()` allein im Gebirge 3,6 → 5,6 ms.
- **Tests (R1, R3, R4):** `tests/unit/m26.test.ts` (über 300 Bäume/Büsche/Felsen im Gebirge, Umgebung im 4-px-Raster
  ohne Stufenwechsel/Wand; Gebirge behält Dekor; Flachland ohne Kanten). Alle Unit-Tests (123) grün,
  E2E `m1-world`, `m2-avatar`, `m20-fog`, `m24-terrain` grün.
- **Bilder:** `screenshots/m26-{schnee,tundra,gebirge}-{vorher,nachher}.png` (Seed `test`; Schnee 3294/1376,
  Tundra-Rand 5289/3756, Gebirge 3476/3427; je 2 × 2 Chunks).
