# Vorschlag: Perspektive – gekippte Bodenebene (Prototyp)

Stand 2026-11-01 · Branch `prototyp/perspektive` (nur lokal, **nicht für main**) · Testseite `?perspektive=1`

## Ausprobieren

```bash
cd .claude/worktrees/perspektive-41cc23   # oder: git switch prototyp/perspektive
npm ci
npm run perspektive                        # öffnet /?perspektive=1 im Browser (Port zeigt Vite an)
```

WASD laufen (W = in die Tiefe), Shift rennen, **Q/E Neigung**, Mausrad Zoom. Bedienfeld rechts: Neigung (0° = heutige
Draufsicht … 70°), Blickwinkel/FOV, Zoom, Sichtweite (Nebel), Bodenpixel (grober Boden), Dunst oder Abdunkeln,
Wände aufrecht/flach, Sprites nach Tiefe/gleich groß, Startort (Spielstart, Wald, Gebirge mit Klippen, Stadt), Seed.
Alles wird im `localStorage` gemerkt. FPS und Logik-Zeit stehen oben im Bedienfeld.

## Ansatz

**„Mode 7“ in einem eigenen WebGL-Canvas unter dem (durchsichtigen) Phaser-Canvas** (`src/prototype/ground.ts`).

- Die Chunks kommen unverändert aus dem Spiel: `ChunkManager` + Chunk-Worker malen das Bodenbild wie gewohnt. Die
  Szene blendet die flachen Bodenbilder aus und kopiert sie in eine **Ringtextur** (16 × 8 Chunks = 8192 × 4096 px,
  Chunk (cx, cy) im Platz (cx mod 16, cy mod 8)). Eine winzige Kennungs-Textur sagt dem Shader, welcher Chunk in
  welchem Platz liegt → fehlende Chunks erscheinen als Nebel, nie als falscher Boden.
- Ein Fragment-Shader schneidet je Bildpunkt den Sehstrahl mit der Bodenebene (exakte Perspektive, kein Dreiecksnetz),
  glättet in der Ferne mit 4 Abtastungen und mischt zur Ferne hin Nebel/Himmel ein.
- Alles Stehende bleibt Phaser: Bäume, Felsen, Gebäude (die Dekor-Bilder des ChunkManagers), Held und NPCs (`Actor`
  unverändert, nur das Sprite wird nach `update` an den projizierten Fußpunkt gesetzt) sind **Billboards**: Fußpunkt
  projiziert, Größe = Maßstab an diesem Punkt, Sortierung nach Weltzeile wie bisher.
- **Felswände**: Wandzellen des Geländerasters werden als senkrechte Streifen aus dem Bodenbild ausgeschnitten und an
  ihrer Unterkante aufgestellt (gleich hohe Nachbarspalten zusammengefasst).
- Kamera (`projection.ts`): nur Neigung, keine Drehung. Zoom = Maßstab am Helden, FOV = Stärke der Perspektive
  (kleines FOV ≈ Parallelprojektion). 0° ist pixelgleich mit der heutigen Ansicht. Boden-Shader und Billboards
  rechnen mit denselben Formeln (Unit-Test: `tests/unit/perspektive.test.ts`).

Warum nicht Phaser-`Mesh` oder Render-Texture + Verzerrung: Ein Mesh interpoliert die Textur je Dreieck affin
(Knicke/Schwimmen in der Ferne, feines Netz nötig) und seine Kamera-Mathe müsste für die Billboards nachgebaut werden.
Ein eigener Shader ist ~150 Zeilen, exakt, und liefert Nebel/Himmel gleich mit. Der eigene Canvas vermeidet Eingriffe
in Phasers WebGL-Zustand (Texturen per `texSubImage2D` nachladen, ohne die ganze Textur neu hochzuladen).

## Eindruck

Screenshots (Seed `splitter`, 1280 × 720, Zoom 2, FOV 50°): `screenshots/perspektive-0.png`, `-30.png`, `-50.png`
(Gebirge), `perspektive-stadt.png`, `perspektive-wald.png` (je 50°).

- **Sieht gut aus:** Ab ~30° wirkt die Welt sofort größer und „weiter“ – man sieht Seen, Wälder und Orte am Horizont
  im Dunst kommen, das stärkt *Erkundung* und *große Welt* deutlich. Städte mit Brunnen, Turm und Häusern wirken
  plastisch. Die LPC-Figuren und das Dekor funktionieren als Billboards ohne jede Anpassung (sie sind ja ohnehin in
  Schrägansicht gezeichnet). Ein Hauch Secret-of-Mana-Flugsequenz.
- **30–40°** ist der beste Kompromiss: Nahbereich fast wie heute (Kampf lesbar), Ferne sichtbar. 50°+ ist
  stimmungsvoll, aber vorn wird es eng, und Billboards ragen stark in die Höhe.
- **Klippen** wirken aufrecht ordentlich, aber nicht perfekt: Die Wand ist als 4-px-Spalten zusammengesetzt
  („Palisaden“-Kanten), das Plateau dahinter bleibt flach (seine Oberkante ist ins Bodenbild gemalt und wird bei
  starker Neigung teils verdeckt), Wände über Chunkgrenzen hinweg bleiben im unteren Teil flach.
- **Wald**: Der Held verschwindet hinter Bäumen – heute schon ein Thema, mit Neigung deutlich stärker.

## Was fürs ganze Spiel schwierig wäre

| Thema | Problem | Lösungsidee |
|---|---|---|
| Sicht / Fog of War (M20, M24, M27) | Die Ferne zeigt viel mehr Welt → widerspricht „fester Sichtausschnitt“ (M27) und der Sichtlinie (M24). | Sichtweite = Nebelgrenze (Shader hat sie schon), Fog-Zellen als Abdunklung im Shader (zweite kleine Textur); gleiche Sichtweite für alle Fenstergrößen über FOV/Zoom festlegen. |
| Klippen / Höhen | Bodenbild ist für Draufsicht gemalt (Plateaus „hochgeschoben“). Echte Höhen bräuchten einen Höhen-Raymarcher („Voxel Space“) oder Wände als 3D-Quads. | Wände als Billboards (wie hier) + Plateaukante im Painter separat malen; ganz sauber erst mit Höhenfeld im Shader (aufwendig). |
| Kampf-Trefferzonen | Spiellogik bleibt in Weltkoordinaten → Trefferzonen stimmen weiter. Aber Schwung-Bögen, Blitze, Schadenszahlen, Markierungen werden heute in Weltpixeln gezeichnet. | Effekte als Billboards bzw. Bodeneffekte über `Projection` zeichnen; Maus/Touch-Zielen über `unproject`. |
| UI auf der Welt | Pfeile, Namen, Quest-Marker, Minimap-Bezug, Weltkarte-Teleport nutzen Kamera-`worldView`. | Eine zentrale „Welt → Bildschirm“-Funktion statt Phaser-Kamera; Kamera bleibt fest. |
| Verdeckung | Held hinter Bäumen/Häusern. | Silhouette/Transparenz von Billboards vor dem Helden. |
| Leistung | Logik ~0,5–1,6 ms je Bild bei 250–500 sichtbaren Billboards (gemessen). Shader trivial. Sichtweite 40 Kacheln braucht ~30 Chunks statt ~9 → Chunk-Worker müssen mehr malen (beim Laufen spürbar am Horizont). Ringtextur 128 MB GPU-Speicher. | Ferne Chunks in niedriger Auflösung (eigene Worker-Stufe), Ringtextur 8 × 8 auf schwacher Hardware (ist eingebaut). |
| Handy | 128 MB Textur + mehr Chunks sind auf Handys zu viel; der Shader ist billig. | Handy: 8 × 8 Ring, Sichtweite ~20, Bodenpixel 2. |
| Pixel-Art | Billboards werden stufenlos skaliert → Pixel unterschiedlich groß, leichtes Flimmern beim Laufen. | Maßstab auf Viertelstufen runden; ferne Sprites ohnehin klein/im Dunst. |
| Mehrspieler/Netz | unberührt (reine Darstellung). | – |

## Aufwand für eine Übernahme (grob)

- **Variante A – „leichte Neigung“ (~30°, feste Werte, Wände als Billboards):** neues Darstellungs-Modul in
  `WorldScene` (Boden-Canvas, Billboard-Pass, Kamera über `Projection`), alle Weltzeichnungen (Kampfeffekte, Marker,
  Namen, Pfeile, Fog, Sicht-Abdunklung, Weltkarte-Klick, Touch-Zielen) auf `Projection` umstellen, Tests/E2E
  anpassen: **ca. 2–3 Meilensteine** in der Größenordnung von M24 (Höhen) – vor allem Kleinarbeit in vielen Modulen.
- **Variante B – mit echten Höhen** (Plateaus erhöht, Klippen als echte Wände, Verdeckung durch Gelände): zusätzlich
  Höhenfeld-Rendering im Shader und Painter-Umbau: **weitere 2–3 Meilensteine**, riskanter.

## Empfehlung

Als Spielgefühl lohnend – die Welt wirkt mit 30–40° deutlich größer und lebendiger, und das zahlt direkt auf
„Erkundung“ und „große Welt“ ein. Vor einer Übernahme sollte entschieden werden, wie das zu **M27 „Fester
Sichtausschnitt“** und **M24 „Sicht nach Sichtlinie“** passt (die Ferne ist ja gerade der Reiz). Vorschlag: Variante A
als eigener Meilenstein, Neigung im Spiel fest (~35°), Draufsicht für Kampf-Arena und Weltkarte; Variante B erst, wenn
A sich bewährt hat.
