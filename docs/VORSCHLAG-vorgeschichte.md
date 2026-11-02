# Vorschlag: Simulierte Vorgeschichte („Vorgeschichte“) – Prototyp

Branch `prototyp/vorgeschichte` (nicht auf `main`). Eigene Systeme für Splitterwelten.

## Ziel

Die Welt soll sich anfühlen, als hätte sie schon lange vor dem Spieler gelebt. Aus dem Seed läuft eine Geschichte über
**mehrere tausend Jahre**, gegliedert in Zeitalter und geprägt von **weltweiten Einschnitten**. Aus ihrem Endzustand
entsteht die spielbare Welt mit Reichen, **großen, gewachsenen Städten**, Ruinen, Gräbern, Schlachtfeldern und Horten.
Altes Wissen ist **bruchstückhaft**: manches ist nur Sage, manches **verschollen**. **Jede Geschichte hinterlässt eine
Spur, die man finden kann.**

Bezug zu den Wünschen (`CLAUDE.md`):
- **Immersiv / Geschichten erleben:** Jeder Ort hat eine Geschichte (Inschriften, Gerüchte, Chronik), Städte zeigen sie
  (Mauerring aus der Blütezeit, verfallene Viertel, Stadt auf den Resten einer älteren).
- **Erkundung:** Verschollene Orte und Artefakte; Sagen sagen nur „irgendwo im Osten“.
- **Große, prozedurale Welt aus dem Seed:** Die Geschichte ist eine reine Funktion von Seed + Einstellungen (Elite-Prinzip).
- **Lebendige Welt / relevante Entscheidungen:** Die Simulation liefert die Ausgangslage, auf der `src/sim` (Live-Welt)
  und spätere Spielerhandlungen aufbauen.

## Version 2 (2026-11-02, Nutzerfeedback)

Feedback: 600 Jahre zu kurz, keine weltweiten Ereignisse, Städte mit 5 Häusern lächerlich, alles gleich genau bekannt.
Wunsch: gut **nachvollziehbar**, **erweiterbar** (neue Ereignisarten) und **konfigurierbar** (wie viel, was nicht, wie
lang) – im Quelltext und in einer Oberfläche.

### Architektur (`src/history/`)

| Datei | Aufgabe | Erweitern |
|---|---|---|
| `config.ts` | `HistoryConfig` mit allen Stellschrauben, `DEFAULT_CONFIG`, Voreinstellungen, `resolveConfig` (Teil-Konfiguration → vollständig, begrenzt), Kodierung für URLs (`?hc=…`) | neues Feld + Standardwert + Eintrag im Schema |
| `schema.ts` | Beschreibung der Felder für die Oberfläche (Bezeichnung, Hilfe, Bereich) | ein Eintrag je Feld; die Oberfläche baut sich daraus |
| `timeline.ts` | Zeitalter → absolute Jahre, Schritte mit variabler Länge (`dt`), `epochAt(y)` | – |
| `simulate.ts` | **Kern** `Sim`: Zustand (Zellen, Reiche, Orte, Figuren, Artefakte, Ereignisse) und gemeinsame Hilfen (`chance`, `place`, `destroy`, `die` …) und die Schrittschleife | – |
| `systems/*.ts` | **Systeme**, die in jedem Schritt laufen (Figuren, Wachstum, Handel, Beziehungen, Kriege, Bestien, Katastrophen, Aufstieg neuer Reiche, Verfall alter Reiche) | neue Datei mit `HistorySystem` + Eintrag in `systems/index.ts` |
| `worldEvents/*.ts` | **Weltereignisse** (Splitterfall, Maschinenkrieg, Große Flut, Eiszeit, Seuchenzeit, Dunkles Zeitalter, Völkerwanderung, Goldenes Zeitalter, Zersplitterung) mit Zeitfenster, Dauer, Modifikatoren und Wirkung | neue Datei mit `WorldEventDef` + Eintrag in `worldEvents/index.ts` |
| `events.ts` | Ereignisarten: Bezeichnung, Kategorie, **Bedeutung** (0–5) | Eintrag; der Text steht in `narrate.ts` (Pflicht durch den Typ) |
| `knowledge.ts` | **Überlieferung**: aus der wahren Geschichte wird, was man heute weiß (gewiss / vage / Sage / verschollen) | Regler in `config.knowledge` |
| `towns.ts` | Größenstufen der Orte (Weiler … Großstadt) und Stadtplan-Vorgaben (Gebäudezahl, Mauerring, Verfall) | Stufen in `config.towns` |
| `narrate.ts` | Texte (Deutsch, Satzvorlagen), wahr oder überliefert | – |
| `toWorld.ts` | Adapter Geschichte → Spielwelt (`MetaSource`) | – |

Die Simulation ist eine **Schleife über Schritte**. In jedem Schritt laufen alle Systeme mit der Schrittlänge `dt`
(Jahre). Wahrscheinlichkeiten sind **je Jahr** angegeben und werden über `sim.chance(p)` = 1 − (1 − p)^dt auf den
Schritt umgerechnet. So bleibt ein grob simuliertes Zeitalter im Mittel gleich ereignisreich, erzeugt aber weniger
Einzelereignisse (weniger Detail = weniger Protokoll). Jedes System liest seine Stärke aus der Konfiguration
(`systems.<id>.on/rate`) und aus den Modifikatoren aktiver Weltereignisse (`sim.mod('war')`).

### Zeitalter (Standard ~7.900 Jahre)

| Zeitalter | Länge | Schritt | Detail | Was | Überlieferung |
|---|---|---|---|---|---|
| Mythenzeit | 4.000 | 100 | 0 | Urreiche, Hochkulturen, Weltereignisse, wenige Gestalten | Sage, viel verschollen |
| Altzeit | 2.500 | 10 | 1 | Reiche, Kriege, Herrscher, Helden | bruchstückhaft, Jahre „um“ |
| Neuzeit | 1.250 | 2 | 2 | alles | weitgehend bekannt |
| Jüngste Zeit | 150 | 1 | 3 | alles, lebende Figuren | gewiss |

Je Zeitalter einstellbar: Länge, Schritt, Detailstufe (welche Systeme laufen: z. B. keine Geburten in der Mythenzeit),
**Mindestbedeutung** fürs Protokoll (in der Mythenzeit nur große Ereignisse) und **Klarheit** der Überlieferung.

### Weltereignisse

Je Welt standardmäßig 6 aus dem Katalog (Gewichte, an/aus, Anzahl, Mindestabstand einstellbar), dazu fest die
Zersplitterung kurz vor der Gegenwart. Jedes hat erlaubte Zeitalter, eine Dauer und **Modifikatoren** (Wachstum,
Krieg, Seuchen, Bestien, Handel, Gründungen), solange es andauert, plus eigene Wirkung zu Beginn, je Schritt und am Ende:

- **Splitterfall** (Mythenzeit): Kristalle stürzen vom Himmel, Krater, Splitter-Adern, Bestien erwachen.
- **Krieg der Ersten Maschinen** (Mythenzeit): Relikte in der Schrottödnis, nahe Orte vernichtet; danach erwachen die Synths.
- **Große Flut** (Alt-/Neuzeit): Küstenorte versinken, Flüchtlinge gründen im Landesinneren neu.
- **Eiszeit** (Alt-/Neuzeit, Jahrhunderte): Der Norden verödet, Reiche ziehen nach Süden.
- **Seuchenzeit**: Seuchen ×8 über Jahrzehnte.
- **Dunkles Zeitalter**: weniger Wachstum, mehr Krieg, **Wissen geht verloren** (Überlieferung davor wird schlechter).
- **Völkerwanderung**: Ein Reich verlässt seine Heimat und siedelt weit entfernt neu.
- **Goldenes Zeitalter**: mehr Wachstum und Handel, weniger Krieg.
- **Die Zersplitterung** (fest, 250–400 Jahre vor heute): wie bisher; das letzte große Ereignis.

### Überlieferung (`knowledge.ts`)

Die Simulation erzeugt die **wahre** Geschichte. Daraus wird je Ereignis eine Klarheit 0–1:
Klarheit des Zeitalters + Bedeutung × Bonus + Gedächtnis des Volks (Elfen, Synths +; Orks −) − Verlust je späterem
dunklen Zeitalter − Verlust, wenn das berichtende Reich untergegangen ist + Rauschen (aus dem Seed).
Stufen: **gewiss** (≥ 0,7), **vage** (≥ 0,45: Jahr „um 3450“), **Sage** (≥ 0,25: „in der Mythenzeit“, Zahlen übertrieben),
**verschollen** (Rest: steht in keiner Chronik). Orte, Figuren und Artefakte erben die beste Stufe ihrer Ereignisse;
ein verlorenes Artefakt ist verschollen, wenn sein Verlust nicht überliefert ist.

Sichtbar: Legenden-Modus zeigt standardmäßig die **Überlieferung**, mit Schalter die **Wahrheit** (Spielleiter).
Im Spiel stützen sich Gerüchte und Obelisken nur auf Überliefertes; verschollene Ruinen heißen „Namenlose Ruine“.
Später (nicht in diesem Prototyp): Funde (Inschriften, Bibliotheken) heben die Stufe – „Verschollene Stadt finden“ als Quest.

### Städte (`towns.ts`, `src/world/townLayout.ts`)

Bevölkerung in realistischen Größen (Weiler < 150, Dorf < 800, Marktflecken < 3.000, Stadt < 12.000, Großstadt
darüber; Hauptstädte bis ~40.000). Wachstum nach Fruchtbarkeit, Fluss, Küste, Handelswegen, Hauptstadt; begrenzt durch
den Platz zum Nachbarort. Je Ort merkt sich die Simulation **Höchststand** (Jahr, Bevölkerung), **Mauerbau** und
**ältere Orte darunter** (Neugründung auf alten Ruinen).

Stadtplan im Spiel (rein, aus Seed + Ort): Gebäudezahl = Bevölkerung / Menschen je Haus (Standard 40, höchstens 600).
- Platz mit Brunnen, Marktständen und Wahrzeichen, gepflasterte Hauptstraßen in vier Richtungen.
- Häuserzeilen mit Gasse davor, gefüllt von innen nach außen (Ort wächst von der Mitte), ausgefranster Rand.
- Mauerring (ab Stadt) im Radius des **Höchststands** mit Toren an den Hauptstraßen; ist der Ort seitdem geschrumpft,
  liegen zwischen Häusern und Mauer **verfallene Häuser**.
- Felder rund um Dörfer und Städte.

### Oberfläche (Legenden-Modus, Seite „Werkstatt“)

Formular aus dem Schema: Zeitalter (Tabelle), Weltereignisse (an/aus, Gewicht, Anzahl), Systeme (an/aus, Stärke),
Völker, Städte, Überlieferung; Voreinstellungen; JSON-Ansicht zum direkten Bearbeiten; „Erzeugen“, „Zurücksetzen“,
„Link teilen“ und „Im Spiel öffnen“ (Konfiguration als `?hc=` in der URL). Die Übersicht zeigt die Zeitalter als Band
mit den Weltereignissen.

## Sichtbar im Spiel (hinter `?vorgeschichte=1`, optional `&hc=…`)

Adapter `WorldMeta` ← History (gleiche Schnittstelle, bisheriges Spiel unverändert):
- **Reiche** = die sechs größten Reiche am Ende; Rivalen = verfeindetste Paare.
- **Siedlungen** = bewohnte Orte am Ende, mit Stadtplan nach Größe; **Ruinen** (Wächter + Schatz) = zerstörte Orte
  (die bedeutendsten, Anzahl einstellbar).
- **Grabmal**, **Gedenkstein**, **Hort** als Fundorte; **Obelisken** an den Schauplätzen überlieferter Ereignisse.
- **NPC-Gerüchte** über nahe, überlieferte Orte und Artefakte (mit Himmelsrichtung).
- **Spielleiter-Modus** (`?gm=1`): Karte zeigt alle historischen Orte; Klick teleportiert hin.

## Legenden-Modus (`?legends=1&seed=…`, `npm run legenden`)

Eigene HTML-Seite ohne Phaser: Übersicht mit Zeitalter-Band, Werkstatt, Listen und Detailseiten für Reiche, Figuren,
Orte, Artefakte und Ereignisse (verlinkt), Zeitleiste, Suche, Karte mit Reichsgrenzen im Zeitverlauf.

## Grenzen des Prototyps

- Grobe Auflösung (64 Kacheln je Zelle) für Ausbreitung und Grenzen; Orte selbst liegen kachelgenau.
- Höchstens sechs Reiche im Spiel; kleinere Reiche gehen in den Grenzen auf.
- Die Landschaft selbst ändert sich durch die Geschichte nicht (Flut und Eiszeit wirken auf Orte, nicht auf Biome).
- Artefakte geben vorerst Splitter + seltenen Gegenstand, keine eigenen Werte.
- Die Geschichte wird im Spiel in Haupt-Thread und Workern parallel erzeugt (~1–2 s längerer Start).

## Ergebnis Version 2 (2026-11-02)

### Starten

```bash
npm run legenden                     # Legenden-Modus (Seed nebel-kristall-427), Seite „Werkstatt“ für die Einstellungen
```

- Legenden: `/?legends=1&seed=nebel-kristall-427` (Einstellungen als `&hc=…`, die Werkstatt erzeugt den Link)
- Spiel: `/?seed=nebel-kristall-427&vorgeschichte=1&gm=1` (optional `&hc=…`; F2 Spielleiter, M Karte)

### Erreicht

- **~7.900 Jahre** in vier Zeitaltern (Schritte 100 / 10 / 2 / 1 Jahre), ~2 s Rechenzeit. Urreiche erscheinen über das
  erste Zehntel verteilt, neue Reiche entstehen in leerem Land, alte zerfallen in Bürgerkriegen; je Welt ~30 Reiche.
- **Weltereignisse** (je Welt ~6 + Zersplitterung): Splitterfall, Krieg der Ersten Maschinen (danach erwachen die
  Synths), Große Flut (Orte versinken), Eiszeit (der Norden verödet), Seuchenzeit, Dunkles Zeitalter, Goldenes
  Zeitalter, Völkerwanderung.
- **Überlieferung**: Mythenzeit fast nur Sage oder verschollen, Jüngste Zeit gewiss; Legenden zeigen die Überlieferung
  (Jahre „um …“, „Der Sage nach: …“, Verschollenes ohne Namen), der Schalter „Wahrheit“ alles. Gerüchte und Chronik der
  Obelisken nutzen die Überlieferung; die Chronik erzählt die Weltereignisse als Zeitalter.
- **Städte**: Großstädte bis ~25.000–35.000 Einwohner, viele Dörfer und Weiler; ~130 Orte mit zusammen ~8.000 Häusern.
  Stadtplan mit Platz, Hauptstraßen zu den Nachbarorten, Häuserzeilen, Mauerring mit Tortürmen (aus der Blütezeit),
  verfallenen Häusern, Vierteln je Baustil und Feldern. Orte entstehen auch auf alten Ruinen („Neu-…“).
- **Konfiguration** (`config.ts`) über Werkstatt, JSON und URL; Systeme (`systems/`) und Weltereignisse (`worldEvents/`)
  als einzelne Dateien mit Register – neue erscheinen automatisch in der Werkstatt.
- Tests: `tests/unit/vorgeschichte-konfig.test.ts` (Konfiguration, Zeitalter, Weltereignisse, Überlieferung, Städte,
  Stadtplan), `tests/unit/vorgeschichte.test.ts`, `tests/e2e/vorgeschichte.spec.ts` (Legenden, Werkstatt, Großstadt im Spiel).

### Offen

- Start mit Vorgeschichte dauert länger (Geschichte ~2 s + Stadtpläne ~1,5 s, in Haupt-Thread und Workern parallel).
  Nächster Schritt: Ergebnis einmal berechnen und an die Worker geben oder zwischenspeichern.
- Wissen im Spiel freischalten (Inschrift lesen → Ereignis wird „gewiss“), widersprüchliche Sagen-Fassungen.
- Nachfahren historischer Figuren als NPCs; Rivalitäten im Spiel mit historischem Grund; Katakomben unter Städten,
  die auf Ruinen stehen; Artefakte als eigene Gegenstände.
- Die Landschaft selbst bleibt unverändert (Flut/Eiszeit wirken nur auf Orte).
