# Modul Inhalte (Quests und Gespräche)

## Ziel

Quests, Dialoge, Händler, Barbier, Herrscher, Geheimnisse (Truhen, Schreine, Obelisken) – was der Spieler in der
Welt erlebt und entscheidet (M7, M15, M18).

## Dateien

| Datei | Inhalt |
|---|---|
| `src/quests/quests.ts` | Quest-Arten, Angebote je NPC, Fortschritt, Ziele, Gebietsbeschreibung |
| `src/scenes/world/WorldTalk.ts` | Gespräche, Händler, Barbier, Treueschwur, Geheimnisse, Quest-Markierungen |
| `src/world/npcs.ts` (Sätze) | Rollen und Sätze – Abstimmung mit dem Modul Weltenbau |

## Schnittstellen

- Ereignisse an die UI: `talk` (Dialog), `quests-changed`, `banner`, `float`, `sfx`, `hero-changed`.
- Belohnungen über `HeroController.reward / lootChest / lootRuin` (Modul Figur).
- Weltfolgen über `WorldState.record` (Modul Weltenbau).

## Tests

```bash
npx vitest run tests/unit/m7.test.ts tests/unit/m15.test.ts
npm run build && npx playwright test tests/e2e/m7-quests.spec.ts tests/e2e/m15-pledge.spec.ts tests/e2e/m18-barber.spec.ts tests/e2e/m16-orientation.spec.ts
```

## Regeln

- Texte auf Deutsch, so geschrieben, dass eine Übersetzung nachrüstbar bleibt (keine Sätze aus Bausteinen zerlegen,
  die nur im Deutschen funktionieren).
- Quests casual halten: jederzeit abbrechbar, Ziele mit Richtung/Gebiet beschrieben.
