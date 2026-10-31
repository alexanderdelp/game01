# Modul Welt (Gelände und Darstellung)

## Ziel

Große, organische, seed-basierte Welt mit Biomen, Höhen (Hänge, Klippen, Seen), Flüssen und Pfaden. Die Welt
muss gut aussehen (Leitbild: Secret of Mana) und sich schnell erzeugen lassen.

## Isoliert prüfen

```bash
npx vite-node tools/preview-area.ts <seed> <tx> <ty> <chunksW> <chunksH> screenshots/area.png   # Ausschnitt als PNG
npx vite-node tools/preview-map.ts                                                       # Übersichtskarte
npx vite-node tools/biome-stats.ts                                                       # Biomgrößen/Durchquerung
npx vite-node tools/prototype-hoehen.ts …                                                # Höhen-Prototyp (M24)
```

Im Spiel: `?seed=test&test=1`. `window.__game.teleport(tx, ty)` springt an eine Kachel.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/world/WorldGen.ts` | Relief, Klima, Biome, `ground()` (Hang, Stufenfeld), Dekorationen, Startpunkt; `WORLD_VERSION` |
| `src/world/terrain.ts` | Stufen, Felswände, Treppen, Geländeraster je Chunk, Kollision (`cellsBlock`), Hangtempo |
| `src/world/sight.ts` | Sichtlinie, Sichtweite, Sichtfeld (rein) |
| `src/world/fog.ts` | Fog of War (`ExploredMap`) |
| `src/world/biomes.ts` | Biom-IDs, Farben, Dekorationsregeln, Tempo (**Knotenpunkt**: neue IDs nur additiv) |
| `src/world/noise.ts`, `rng.ts`, `collision.ts` | Grundlagen |
| `src/render/chunkPixels.ts`, `groundPatterns.ts`, `procSprites.ts` | Bodenbild, Muster, prozedurale Sprites |
| `src/render/ChunkManager.ts`, `chunkWorker.ts`, `chunkProtocol.ts` | Laden in Web Workern, Kollision im Spiel |
| `src/scenes/world/WorldSight.ts` | Sichtschatten und Fog im Spiel |

## Schnittstellen

- `WorldGen.biomeAt / isWalkable / decorationAt / climate / ground / chunk` – genutzt von fast allem.
- `ChunkManager.blocked / terrainBlocked / speedAt / biomeAt` – Bewegung und Kampf (`CombatTerrain`).
- `ChunkResult` (Worker → Haupt-Thread), `tileHeight`, `sees`, `ExploredMap`.
- Änderungen an der Generierung verändern alle Welten: dann `WORLD_VERSION` erhöhen (Spielstände dürfen
  zurückgesetzt werden – Tech-Demo).

## Tests

```bash
npx vitest run tests/unit/world.test.ts tests/unit/m19.test.ts tests/unit/m20.test.ts tests/unit/m24.test.ts
npm run build && npx playwright test tests/e2e/m1-world.spec.ts tests/e2e/m2-avatar.spec.ts tests/e2e/m20-fog.spec.ts tests/e2e/m24-terrain.spec.ts
```

## Regeln

- Optik vor dem Abschluss per `preview-area` prüfen und ein Vorher/Nachher-Bild in die Übergabe legen.
- Große optische Umbauten braucht der Nutzer zur Freigabe (über den Koordinator).
- Laufzeit im Blick: Chunk im Worker < 150 ms, Sicht/Fog je Schritt < 5 ms.
