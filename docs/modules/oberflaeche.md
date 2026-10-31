# Modul Oberfläche (HUD, Karte, Menüs, Klang)

## Ziel

Lesbare, ruhige Oberfläche für PC und Handy: HUD, Hinweise, Minimap, zoombare Weltkarte, Menüs, Dialogfenster,
Musik und Klänge (M13, M16, M22).

## Dateien

| Datei | Inhalt |
|---|---|
| `src/scenes/UIScene.ts` | HUD, Banner, Questpfeil, Dialog, Menüs, Touch-Steuerung |
| `src/ui/WorldMap.ts` | Weltkarte, Minimap, Fog-Textur, Karten-Worker |
| `src/ui/HeroPanel.ts` | Heldenfenster (Abstimmung mit Modul Figur) |
| `src/ui/bannerQueue.ts` | Warteschlange für Hinweise |
| `src/audio/audio.ts` | Prozedurale Musik und Klänge |
| `src/scenes/TitleScene.ts` | Titelbildschirm |

## Schnittstellen

- Liest die Welt-Szene nur lesend (`ws.hero`, `ws.state`, `ws.fog`, `ws.npcs` …) und ruft Aktionen
  (`interact`, `choose`, `travel`, `attack` …). Ereignisse von der Welt: `talk`, `banner`, `float`, `damage`,
  `quests-changed`, `hero-changed`, `news-summary`, `player-died`.
- Test-Schnittstelle: `clickPanel(name)` – Elemente mit `setName(…)` benennen, damit Tests sie finden.

## Tests

```bash
npx vitest run tests/unit/m13.test.ts tests/unit/m16.test.ts
npm run build && npx playwright test tests/e2e/m13-polish.spec.ts tests/e2e/m16-orientation.spec.ts tests/e2e/m22-map.spec.ts tests/e2e/m5-rpg.spec.ts
```

## Regeln

- Immer auch mit Handy-Größe (375 × 812) und niedrigem Laptop-Fenster (1280 × 560) prüfen.
- Kein Element darf wichtige Knöpfe verdecken; Texte auf Deutsch.
