# Vorschlag: Simulierte Vorgeschichte („Vorgeschichte“) – Prototyp

Branch `prototyp/vorgeschichte` (nicht auf `main`). Eigene Systeme für Splitterwelten.

## Ziel

Die Welt soll sich anfühlen, als hätte sie schon vor dem Spieler gelebt. Aus dem Seed läuft eine Geschichte über
Jahrhunderte. Aus ihrem Endzustand entsteht die spielbare Welt mit Reichen, Städten, Ruinen, Gräbern, Schlachtfeldern
und Horten. **Jede Geschichte hinterlässt eine Spur, die man finden kann.**

Bezug zu den Wünschen (`CLAUDE.md`):
- **Immersiv / Geschichten erleben:** Jeder Ort hat eine Geschichte, die man im Spiel liest (Inschriften, Gerüchte, Chronik).
- **Erkundung:** Verlorene Artefakte liegen an konkreten Orten (Grab, Hort, Schlachtfeld, Ruine). Gerüchte von NPCs führen hin.
- **Große, prozedurale Welt aus dem Seed:** Die Geschichte ist eine reine Funktion des Seeds (Elite-Prinzip), wie die Landschaft.
- **Lebendige Welt / relevante Entscheidungen:** Die Simulation liefert die Ausgangslage (Rivalitäten, Bündnisse), auf der
  `src/sim` (Live-Welt) und spätere Spielerhandlungen aufbauen.

## Ablauf (`generateHistory(seed, { years })`)

Rein, ohne Phaser, in `src/history/`. Läuft im Haupt-Thread, im Chunk-Worker und im Legenden-Worker gleich.

1. **Geografie** (grobes Raster 128 × 128, eine Zelle = 64 Kacheln) aus `WorldGen`: Biom, Höhe, Küste, Seen, Flüsse.
   Die Flüsse stammen aus demselben Flusslauf wie im Spiel (`traceRivers`, aus `meta.ts` herausgelöst).
2. **Geologie / Ressourcen** je Zelle: fruchtbares Land, Holz, Erz, **Splitter-Adern** (an Kristallhainen und als
   seed-basierte Adern) und **Schrott** (Relikte der „Ersten Maschinen“ aus der Vorzeit, Schrottödnis).
3. **Völker** erscheinen in passenden Herkunftsgebieten: Mensch (Grasland/Wald), Elf (Wald/Dschungel/Kristall),
   Ork (Hügel/Savanne/Steppe), Synth (erwachen in Schrottfeldern, erst nach einigen Jahrzehnten).
4. **Jahresschleife** (Standard 600 Jahre, Regler 300–1000):
   - Wachstum der Orte nach Fruchtbarkeit; Gründung neuer Dörfer bevorzugt an Flüssen, Küsten und Ressourcen;
     Türme (Magier), Labore (Technokratie), Tempel (Orden), Festungen (Klan, Grenzen), Minen.
   - Beziehungen benachbarter Reiche: Handel (+), Streit um Splitter-Adern und Grenzen (−) → **Bündnisse, Kriege**.
     Krieg: **Belagerung** eines Grenzortes, Schlacht → **Schlachtfeld** mit Gedenkstein; Ort erobert oder **zerstört (Ruine)**.
   - **Spaltung** großer Reiche bei Erbfolgestreit; **Seuchen und Hungersnöte** (Orte verlassen → Ruine).
   - **Die Zersplitterung** (einmalig, ca. 55–70 % der Zeit): Ein Erzmagier und ein Ingenieur versuchen, den größten
     Splitter zu bändigen. Der Versuch zerreißt die Gegend: Orte werden Ruinen, Ungeheuer erwachen. Hier treffen
     Fantasy und Cyberpunk zusammen; die Chronik der Obelisken erzählt dieses Ereignis.
5. **Einzelwesen:** Herrscher (Erbfolge), Helden, Erzmagier, Ingenieure, Verräter, **Großbestien mit Hort**.
   Lebenslauf: Geburt, Ämter, Taten, Kämpfe, Tod (wer, wo, wie), Kinder.
6. **Artefakte:** benannte Gegenstände mit Schöpfer, Besitzerkette (Erbe, Beute, Raub) und Verlust (mit dem Herrscher
   **begraben**, auf dem **Schlachtfeld** liegen geblieben, im **Hort** einer Bestie, in einer **Ruine** verschüttet).
7. **Ereignisprotokoll:** Jahr, Art, Beteiligte (Reiche, Figuren, Orte, Artefakte). Texte entstehen erst bei der
   Anzeige aus Satzvorlagen (Daten bleiben klein, Texte sind übersetzbar).

## Datenmodell (`src/history/types.ts`)

`History { seed, years, worldName, cells, civs, sites, figures, artifacts, events }`. Alles über Zahl-IDs verknüpft.
- `Site`: Art, Name, Kachelposition, Gründung, Besitzer im Zeitverlauf, Zerstörung (Ereignis-ID), Ereignisse.
- `Civ`: Volk, Fraktion, Farbe, Gründung/Untergang, Hauptstadt, Herrscherliste, Herkunft (Spaltung von …).
- `Figure`: Volk, Rolle, Reich, Geburt/Tod, Todesursache, Mörder, Sterbeort, Eltern/Kinder, Ämter.
- `Artifact`: Art, Schöpfer, Besitzerkette, Verbleib (Ort oder Figur).
- `HEvent`: Jahr, Art, Bezüge. Reichsgrenzen in einem Jahr folgen aus den Orten und ihren Besitzern zu dem Jahr.

## Sichtbar im Spiel (hinter `?vorgeschichte=1`)

Adapter `WorldMeta` ← History (gleiche Schnittstelle, bisheriges Spiel unverändert):
- **Reiche** = die sechs größten Reiche am Ende (Fraktion, Farbe, Hauptstadt); Rivalen = verfeindetste Paare.
- **Siedlungen** = bewohnte Städte und Dörfer am Ende; **Ruinen** (Wächter + Schatz) = zerstörte Orte.
- Neue Fundorte: **Grabmal** (Inschrift, ggf. Grabbeigabe = Artefakt), **Gedenkstein** auf Schlachtfeldern,
  **Hort** einer Bestie (Artefakt; lebt die Bestie noch, wacht sie dort).
- **Obelisken** stehen an den Orten der acht wichtigsten Ereignisse, die **Chronik** erzählt echte Ereignisse.
- **NPC-Gerüchte** über nahe historische Orte und verlorene Artefakte (mit Himmelsrichtung).
- **Spielleiter-Modus** (`?gm=1`): Karte zeigt alle historischen Orte; Klick auf einen Ort teleportiert hin und zeigt
  dessen Geschichte mit Link in den Legenden-Modus.

## Legenden-Modus (`?legends=1&seed=…`, `npm run legenden`)

Eigene HTML-Seite ohne Phaser (Lesbarkeit): Übersicht, Listen und Detailseiten für Reiche, Figuren, Orte, Artefakte
und Ereignisse, überall verlinkt (`#site/12`), Zeitleiste, Suche/Filter, **Karte mit Orten und Reichsgrenzen im
Zeitverlauf** (Jahr-Regler). Die Simulation läuft dort in einem Web Worker.

## Grenzen des Prototyps

- Grobe Auflösung (64 Kacheln je Zelle) für Ausbreitung und Grenzen; Orte selbst liegen kachelgenau.
- Höchstens sechs Reiche im Spiel (das übrige Spiel nimmt sechs an); kleinere Reiche gehen in den Grenzen auf.
- Artefakte geben vorerst Splitter + seltenen Gegenstand und einen Eintrag in der Chronik des Helden, keine eigenen Werte.
