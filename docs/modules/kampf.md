# Modul Kampf

## Ziel

Einfache, spaßige Action mit **Unmittelbarkeit wie Super Mario World**: Die Figur tut genau, was man gerade
drückt. Kein Vormerken von Tasten, kein automatisches Drehen zum Gegner, kurze Verzögerungen. Das Spielgefühl hat
Vorrang vor Komplexität (Wünsche: „casual“, „einfache, spaßige Action“).

## Arbeiten in der Kampf-Arena

```bash
npm run arena          # Entwicklungsserver, öffnet http://localhost:5173/?arena=1
```

Auch online: `https://alexanderdelp.github.io/game01/?arena=1`.

- **Gelände** (M25): Offen, Säulen, Wald & Felsen, Engpässe, Sumpf (`src/arena/layouts.ts`, Daten → `blocked`/`speedAt`).
- **Waffe** (M25): ohne / Alter Dolch / Dolch gewöhnlich, selten, episch mit Stufe; Werte wie im Spiel (`finalStats`).
- Gegner per Knopf (Schleim, Räuber, Drohne, Irrlicht) oder als **Welle**, **Anzahl** 1/3/5, **Ort** zufällig / vor dem
  Helden / per Klick, Stufe, Elite, „eingefroren“, „kommen wieder“. Mausrad zoomt.
- **Regler für alle Kampfwerte, live**: Lauftempo, Hieb-Bildrate, Treffer-Zeitpunkt, Pause nach dem Hieb, Tempo beim
  Hieb, Kontrollverlust bei Treffern. Werte bleiben im Browser gespeichert.
- „Werte kopieren“ erzeugt den Code für `src/combat/combat.ts` → so wandern gute Einstellungen ins Spiel.
- Statistik: Hiebe, Treffer, Schaden/s, erlittener Schaden, Blocks/Paraden/Ausweichen, Hieb-Zyklus.
- **Blocken/Parieren/Ausweichen** (M31, vorerst nur Arena): J Hieb, K Zauber, L halten = Block, Leertaste = Ausweichen.
  Schalter `PlayerCombat.guardEnabled`.

## Dateien des Moduls

| Datei | Inhalt |
|---|---|
| `src/combat/combat.ts` | reine Kampflogik: Schaden, Trefferboxen, Rückstoß, Stufen, **`PLAYER_SWING`, `PLAYER_MOVE`**, Block/Ausweichen (`PLAYER_BLOCK`, `PLAYER_DODGE`, `guardAgainst`, `Dodge`) |
| `src/combat/enemies.ts` | Gegnerarten (`ENEMIES`) und seed-basiertes Auftreten |
| `src/combat/tuning.ts` | Regler-Definitionen der Arena, Export als Code |
| `src/entities/PlayerCombat.ts` | Hieb, Zauber, Treffer, Tod des Spielers |
| `src/entities/Enemy.ts` | Gegner-KI (umherlaufen, verfolgen, ausholen, angreifen), `EnemyManager` |
| `src/combat/pathing.ts` | Umweg um Hindernisse (Sichtlinie, Breitensuche) für Gegner am Boden |
| `src/entities/Actor.ts` | Bewegung und Animation einer Figur (auch von NPCs genutzt – vorsichtig ändern) |
| `src/arena/` | Arena-Szene und Bedienfeld |

## Schnittstellen zum Rest des Spiels

- **`CombatTerrain`** (`Enemy.ts`): alles, was der Kampf vom Gelände braucht (`biomeAt`, `blocked`,
  `terrainBlocked`, `speedAt`, `isWalkable`). Welt: Chunks + Weltgenerator; Arena: flache Fläche mit Säulen.
- **`CombatCtx`**: Gelände, Spielerfigur, Schaden an den Spieler (`hurtPlayer(…, source?)`, Angreifer für die Parade), Geschosse, Mitspieler.
- **Ereignisse** der Szene: `player-attack`, `enemy-hit`, `damage`, `defeated`, `player-died`, `sfx` – die Welt
  hängt daran EP, Beute, Quests, Klänge und Weltzustand. Namen und Daten nicht ohne Absprache ändern.
- `EnemyManager.add(spawn)` setzt Gegner direkt ein; mit `source` erscheinen sie seed-basiert mit den Chunks.

## Tests

```bash
npx vitest run tests/unit/m4.test.ts tests/unit/m17.test.ts tests/unit/m25.test.ts tests/unit/m28.test.ts tests/unit/m31.test.ts    # Kampflogik und Zeitwerte
npm run build && npx playwright test tests/e2e/kampf.spec.ts tests/e2e/arena.spec.ts
```

Grundsätze und Hilfen für Tests (Polling statt Wartezeit, Bewegen nach Bildern, `SHOTS=1`): `docs/TESTS.md`.

Hinweis: Der Testbrowser läuft gedrosselt (ein Hieb dauert dort > 1 s Echtzeit). Abläufe am Spielzustand prüfen
(`g.swinging`, `g.attacks`), nicht an der Uhr; Zeitwerte per Unit-Test.

## Regeln

- Im Modul bleiben. Andere Dateien nur, wenn eine Schnittstelle es verlangt – dann in der Übergabe erwähnen.
- Spielgefühl-Änderungen erst in der Arena ausprobieren, dann die Werte übernehmen.
- Entscheidungen kurz in `docs/milestones/` (laufender Meilenstein) oder in `CLAUDE.md` → „Entscheidungen“ festhalten.
- Vor dem Abschluss: obige Tests grün; bei Optik ein Screenshot aus der Arena.
