# Design-Dokument – Game01

Arbeitstitel: **Game01** (ein endgültiger Name entsteht mit dem World Building, M8).

## Vision

Ein Action-RPG in Pixel-Art (Vorbild Secret of Mana) in einer riesigen, aus einem Seed
generierten Welt, in der High-Fantasy und Cyberpunk aufeinandertreffen: Elfenwälder neben
verfallenen Neon-Ruinen, Zauberkristalle als Energiequelle alter Maschinen. Die Welt lebt
weiter, auch wenn niemand spielt. 1–3 Freunde teilen sich eine Welt.

## Säulen (abgeleitet aus den Wünschen in CLAUDE.md)

| Säule | Konsequenz fürs Design |
|---|---|
| Casual | Sitzungen von 5–15 min sinnvoll; automatisches Speichern; wenige Tasten (Bewegen, Angriff, Interaktion, Karte). |
| Große, generierte Welt | Alles Weltwissen ist eine reine Funktion `f(seed, x, y)`. Nur *Abweichungen* (Spielerhandlungen, Simulation) werden gespeichert. |
| Lebendige Welt | Simulation läuft in groben Weltzeit-Ticks; beim Laden wird die verpasste Zeit deterministisch nachgerechnet. |
| Relevante Entscheidungen | Spielerhandlungen sind Ereignisse im Weltzustand (später teilbar zwischen Spielern). |
| Erkundung | Biome, Reiche, Ruinen, Geheimnisse – über die Karte verteilt, seed-basiert. |
| Pixel-Art | 16-px-Kacheln, 3-fache Vergrößerung, Nearest-Neighbor. |

## Technik

- **TypeScript + Phaser 3**, gebaut mit **Vite**, ausgeliefert über **GitHub Pages**.
- **Tests:** Vitest (Unit, v. a. reine Weltlogik) und Playwright (Akzeptanz: Spiel startet, rendert, reagiert; Screenshots).
- **Architektur:** Weltlogik (`src/world`) ist frei von Phaser und damit ohne Browser testbar. Rendering (`src/render`) und Szenen (`src/scenes`) hängen davon ab, nie umgekehrt.
- **Datenhaltung:** bis M10 lokal (localStorage / IndexedDB).

## Welt (Stand M1)

- Endliche, sehr große Welt: **4096 × 4096 Kacheln** (≈ 16,7 Mio. Kacheln), aufgeteilt in Chunks zu 32 × 32 Kacheln.
- Ein Kontinent mit Küsten, Inseln und Ozean am Rand.
- Felder: **Höhe**, **Feuchtigkeit**, **Temperatur** (Breitengrad + Rauschen + Höhe) → **Biom**.
- Biome (M1): Tiefsee, Meer, Strand, Grasland, Wald, Dschungel, Sumpf, Savanne, Wüste, Tundra, Schnee, Gebirge, Felsgipfel – plus zwei fantastische Sonderbiome: **Kristallhain** (Magie) und **Schrottödnis** (Cyberpunk-Relikte).
- Dekorationen (Bäume, Steine, Kakteen, Kristalle, Schrottteile) seed-basiert pro Kachel.

## Grafik

M1 erzeugt Kachel- und Dekorationsgrafiken prozedural im Code (Pixelmuster und handgezeichnete
ASCII-Pixel-Sprites). Damit gibt es keine Lizenzfragen für die Landschaft, und jedes Biom bekommt
seinen eigenen Stil. Für Figuren (ab M2) werden LPC-Sprites eingesetzt.

## Steuerung (Zielbild)

| Aktion | Tastatur | Später |
|---|---|---|
| Bewegen | WASD / Pfeiltasten | Gamepad, Touch |
| Karte | M | |
| Zoom | Mausrad / + / − | |
