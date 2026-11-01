# Modul Weltenbau und lebendige Welt

## Ziel

Reiche, Fraktionen, Orte, Ruinen, Chronik (M8, M14, M15) und die Welt, die ohne Spieler weiterläuft (M10):
Karawanen, Wetter, Invasionen, Wohlstand. Persistente Folgen von Handlungen im Ereignisprotokoll (M9).

## Dateien

| Datei | Inhalt |
|---|---|
| `src/world/meta.ts` | `WorldMeta`: Reiche, Rivalen, Siedlungen, Gebäude, Pfade, Flüsse, Ruinen, Geheimnisse, Chronik |
| `src/world/npcs.ts` | NPC-Rollen, Sätze, Auftreten je Biom |
| `src/sim/simulation.ts`, `src/sim/LiveWorld.ts` | Simulation aus Seed + Uhrzeit, Neuigkeiten |
| `src/state/worldState.ts` | Ereignisprotokoll, abgeleiteter Weltzustand, Ansehen |
| `src/render/TownDecor.ts`, `src/render/Markers.ts` | Ausbau der Orte, Schilder/Grabsteine |
| `src/entities/NpcManager.ts` | NPCs laden, wandern lassen |

## Schnittstellen

- `WorldMeta` (über `world.meta`), `WorldState.record/d`, `LiveWorld` (Wetter, Karawanen, Invasion), `newsBetween`.
- Ereignistypen in `worldState.ts` sind ein Vertrag mit Netz und Speicherständen: nur additiv erweitern.

## Tests

```bash
npx vitest run tests/unit/m3.test.ts tests/unit/m8.test.ts tests/unit/m9.test.ts tests/unit/m10.test.ts tests/unit/m14.test.ts tests/unit/m15.test.ts
npm run build && npx playwright test tests/e2e/weltenbau.spec.ts
```

Grundsätze und Hilfen für Tests (Polling statt Wartezeit, Bewegen nach Bildern, `SHOTS=1`): `docs/TESTS.md`.

## Regeln

- Alles bleibt eine Funktion von Seed (+ Uhrzeit); gespeichert werden nur Abweichungen (Ereignisse).
- Testmodus `?test=1` (feste Weltzeit, keine Invasionen) nicht brechen.
