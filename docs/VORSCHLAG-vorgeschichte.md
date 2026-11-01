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

## Ergebnis des Prototyps (2026-11-02)

### Starten

```bash
npm ci
npm run legenden                     # Legenden-Modus im Browser (Seed nebel-kristall-427)
npx vite                             # dann die URLs unten
```

- Legenden: `http://localhost:5173/?legends=1&seed=nebel-kristall-427` (optional `&jahre=300…1000`)
- Spiel mit Vorgeschichte und Spielleiter: `http://localhost:5173/?seed=nebel-kristall-427&vorgeschichte=1&gm=1`
  (F2 schaltet den Spielleiter-Modus ein, M öffnet die Karte; Klick auf einen Ort → Teleport und Ortsgeschichte)
- Aus einer Ortsseite der Legenden: „Im Spiel ansehen“ öffnet `…&gm=1&at=tx,ty` direkt am Ort.

### Erreicht

- **Simulation** (`src/history/`, ~0,5–1,6 s für 600 Jahre): Geologie (fruchtbares Land, Holz, Erz, Splitter-Adern,
  Schrott), vier Völker, Reiche mit Fraktionen, Ausbreitung an Flüssen und Küsten, Türme/Labore/Tempel/Festungen/Minen,
  Handel, Bündnisse, Kriege mit Schlachten, Eroberung und Zerstörung, Verrat, Spaltungen, Seuchen und Hungersnöte,
  Erbfolge mit Nachkommen, Helden, Erzmagier, Ingenieure, Großbestien mit Horten, Artefakte mit Besitzerkette und
  Verlust, die **Zersplitterung** mit dem großen Artefakt. Je Welt ~130 bewohnte Orte, 20–30 Ruinen, 60–70 Artefakte
  (davon ~50 verschollen und auffindbar), ~1500 Ereignisse.
- **Legenden-Modus**: Übersicht, Karte mit Reichsgrenzen, Orten, Ruinen und Handelswegen im Zeitverlauf (Regler und
  Abspielen), Zeitleiste der Reiche, Listen mit Filter und Sortierung, verlinkte Detailseiten, Suche.
- **Spielwelt aus der Geschichte** (`?vorgeschichte=1`, Adapter `src/history/toWorld.ts` → `WorldMeta`): die sechs größten
  Reiche, alle bewohnten Orte als Siedlungen, Ruinen mit Wächter (Banner nennt ihren Untergang), Grabmäler,
  Gedenksteine auf Schlachtfeldern und Horte als neue Fundorte (Inschrift lesen, Artefakt bergen; lebende Bestien
  bewachen ihren Hort), Obelisken-Chronik aus echten Ereignissen nahe den Schauplätzen, NPC-Gerüchte mit Richtung.
- **Spielleiter-Karte**: alle historischen Orte; Klick teleportiert und zeigt die Ortsgeschichte mit Link in die Legenden.
- Tests: `tests/unit/vorgeschichte.test.ts` (Determinismus, Laufzeit, Plausibilität, Adapter, Gerüchte),
  `tests/e2e/vorgeschichte.spec.ts` (Legenden und Spiel mit Spielleiter-Karte). Ohne Schalter ist das Spiel unverändert.

### Offen

- Spielstände: Welt mit Vorgeschichte teilt den Weltzustand (Entdeckungen nach Ort-ID) mit der Welt ohne; nur die
  Position wird getrennt gespeichert. Für eine Übernahme eigene Weltversion bzw. eigener Speicherschlüssel.
- Die Live-Simulation (`src/sim`, Macht der Reiche) verschiebt die Grenzen mit Vorgeschichte nicht; Nachrichten und
  Karawanen laufen aber über die neuen Orte. Gut wäre: Live-Welt setzt die Geschichte fort (neue Ereignisse ins Protokoll).
- Artefakte sind im Spiel noch normale Beute + Banner; eigene Gegenstände mit Werten und Geschichte fehlen.
- ~130 Siedlungen statt ~55: Wildnis bleibt groß, aber Orte sind dichter; Obergrenze `MAX_SITES` ist ein Regler.
- Figuren tauchen im Spiel nur in Texten auf (keine Nachfahren als NPCs, keine Gräber mit Namen in Quests).
- Die Laufzeit kommt im Spiel mehrfach vor (Haupt-Thread + Chunk-Worker + Karten-Worker), dadurch ~1 s längerer Start.

### Empfehlung für eine Übernahme

1. Erst die **Daten- und Textschicht** übernehmen (`src/history/` + Legenden-Modus) – sie ist rein, getestet und stört nichts.
2. Dann die Welt mit Vorgeschichte als **neue Weltversion** (statt Schalter), mit eigenem Speicherschlüssel; die
   bisherige Platzierung in `meta.ts` entfällt dann.
3. Danach Quests auf die Geschichte stützen (Artefakt bergen, Bestie erschlagen, Grab besuchen) und die Live-Welt
   Ereignisse in dasselbe Protokoll schreiben lassen – so wird die Geschichte nahtlos zur Gegenwart.
