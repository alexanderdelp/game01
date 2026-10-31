# Design-Dokument – Splitterwelten (Game01)

Stand: 2026-10-31, nach Meilenstein 15. Details und Anforderungen je Meilenstein: [`docs/milestones/`](milestones/).

## Vision

Ein Action-RPG in Pixel-Art (Vorbild Secret of Mana) in einer riesigen, aus einem Seed generierten Welt, in der
High-Fantasy und Cyberpunk aufeinandertreffen: Elfenwälder neben Schrottödnissen, Kristallsplitter als Energie für
Zauber und Maschinen. Die Welt lebt nach der echten Uhrzeit weiter. 1–3 Freunde teilen sich eine Welt – zeitversetzt
oder live.

## Säulen (aus den Wünschen in CLAUDE.md) und wie sie umgesetzt sind

| Wunsch | Umsetzung |
|---|---|
| Casual | Titelbildschirm mit „Weiterspielen“, alles speichert automatisch, Tod ohne Strafe, Schnellreise, Pfeil zum nächsten Ziel, wenige Tasten, Handy-Steuerung. |
| Immersiv | Reiche mit Fraktionen, Orte mit Bewohnern, Chronik an Obelisken, Tag/Nacht, Wetter, Musik und Klänge. |
| Relevante Entscheidungen | Treueschwur bei einem Herrscher (Reich wächst, Rabatt – aber der Rivale wird zum Feind), Weltzustand als Ereignisprotokoll: Truhen bleiben offen, Orte wachsen sichtbar bis zur Heldenstatue, Ansehen beim Reich, Botschaften für andere. |
| Lebendige Welt | Simulation aus Seed + Uhrzeit: Karawanen, Reichsmacht verschiebt Grenzen, Orte schwanken, Invasionen, „Während du weg warst …“. |
| Erkundung | Gelände mit Hängen, Klippen und Seen; Sicht und Fog of War folgen der Sichtlinie (Gipfel als Aussichtspunkte). 8192² Kacheln, 17 Biome, 6 Reiche, ~20 Orte, Truhen, Schreine, 8 Obelisken, ~18 Ruinen mit Wächter und Schatz, Erkundungsquests, Wegsteine. |
| Große Spielwelt | Alles Weltwissen ist eine Funktion `f(seed, x, y[, zeit])`; nur Abweichungen werden gespeichert. |
| Charakterentwicklung | EP und Stufen, Talente (Kraft, Zähigkeit, Flinkheit), Ausrüstung in drei Seltenheiten. |
| Charakter-Customizing | Volk (Mensch, Elf, Ork, Synth) mit Bonus, Körper, Haut, Frisur, Farben, Name – jederzeit änderbar. |
| Genres | Fantasy (Schleime, Irrlichter, Magierzirkel, Fachwerk) ↔ Cyberpunk (Drohnen, Technokratie, Neon-Häuser, Synth). |
| Kampf | Dolchhieb mit Trefferfenster, Fernzauber „Splitterblitz“, Rückstoß, Schadenszahlen, vier Gegnerarten mit eigenem Verhalten, Elite-Gegner und Ruinenwächter. |
| Multiplayer | Welt teilen per Link (ohne Server) oder automatisch/live über den Referenz-Server: Mitspieler sehen, Koop-Kampf, Chat. |
| Pixel-Art | 32-px-Kacheln (LPC-Maßstab), prozedurale Landschaft und Gebäude, LPC-Figuren. |

## Architektur

```
src/world/     reine Weltlogik: Rauschen, Biome, WorldGen, NPC-/Gegner-Auftreten, World Building (meta.ts), Kollision
src/combat/    reine Kampflogik und Gegnerdefinitionen
src/rpg/       reine RPG-Logik: Gegenstände, Progression, Völker
src/quests/    reine Questlogik
src/state/     Weltzustand (Ereignisprotokoll), Teilen-Code, Sync-Client
src/sim/       Simulation aus Seed + Uhrzeit (rein) und ihre Einbindung (LiveWorld)
src/net/       Live-Zusammenspiel (Nachrichten, Verbindung)
src/render/    Phaser-Darstellung: Chunks (Worker), prozedurale Sprites, Orte, Marker
src/entities/  Figuren: Actor, Spieler-Kampf, Held, NPCs, Gegner, Mitspieler
src/scenes/    Titel, Erschaffung, Welt, UI
src/audio/     prozedurale Musik und Klänge
server/        Referenz-Server für geteilte Welten und Live-Spiel (ohne Abhängigkeiten)
tools/         Vorschau-Werkzeuge, LPC-Import, Belastungstest
```

- Reine Logik ist ohne Browser testbar (Vitest), alles Sichtbare per Playwright (Akzeptanztests + Screenshots).
- Chunks (16 × 16 Kacheln) werden in Web Workern erzeugt und gemalt; Schatten und flache Dekorationen sind ins Bodenbild gebacken.
- CI (GitHub Actions) testet und deployt nur bei Erfolg auf GitHub Pages.

## Daten

| Was | Wo | Geteilt? |
|---|---|---|
| Landschaft, Reiche, Orte, Chronik, Simulation | aus Seed (+ Uhrzeit) berechnet | identisch für alle |
| Weltzustand (Truhen, Kills, Entdeckungen, Quests, Botschaften, Gräber) | Ereignisprotokoll `game01:world:<seed>` | per Link/Datei/Server |
| Held (Name, Volk, Aussehen, Stufe, Inventar, Quests, Chronik) | `game01:hero:<seed>` | nein (gehört dem Spieler) |
| Position, Einstellungen, zuletzt gespielt | `localStorage` | nein |

## Steuerung

| Aktion | Tastatur | Handy | Gamepad |
|---|---|---|---|
| Laufen / Rennen | WASD, Pfeile / Shift | Ziehen (virtueller Stick) | linker Stick, Steuerkreuz / B halten |
| Angriff | Leertaste, J | ⚔ | A |
| Zauber „Splitterblitz“ | K | ✦ | RT |
| Reden / Benutzen | E | E | X |
| Trank | Q | ♥ | Y |
| Karte (Schnellreise) | M | Karte | Select |
| Menü | H | ☰ | Start |
| Zoom | Mausrad, +/− | Menü | LB / RB |
| Held, Quests, Chronik, Neuigkeiten, Teilen | C, L, B, U, G | Menü | Menü |
| Schild, Chat | T, Enter | Menü | Menü |

## Mögliche nächste Schritte

- Öffentlichen Sync-Server betreiben (braucht ein Hosting-Konto des Nutzers) → dauerhaft geteilte Welten und Live-Spiel.
- Dungeons als besondere Herausforderung für Live-Gruppen.
- Weitere Waffen (LPC-Übergrößen-Animationen), Zauber für den Magie-Teil, Fahrzeuge/Mechs für den Cyber-Teil.
- Fraktions-Questreihen, die die Reichsmacht beeinflussen.
