# Modul Figur (Charakter, Ausrüstung, Fortschritt)

## Ziel

Völker, Aussehen aus Ausrüstung (M23), Werte, Talente, Stufen, Gegenstände (M5, M6, M18). Offene Aufgabe mit dem
Nutzer: Klassen und/oder Skilltrees (`docs/VORSCHLAG-aussehen-voelker.md`).

## Isoliert prüfen

Erschaffungsbildschirm: neue Welt, z. B. `?seed=figurtest&test=1`. Heldenfenster im Spiel: Taste C/I.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/character/lpc.ts`, `CharacterFactory.ts`, `outfit.ts` | LPC-Ebenen, Umfärben, Aussehen aus Ausrüstung |
| `src/rpg/items.ts`, `progression.ts`, `races.ts` | Gegenstände, Werte, Talente, Völker |
| `src/entities/HeroController.ts` | Held im Spiel: Beute, EP, Speichern |
| `src/scenes/CreateScene.ts` | Erschaffung und Barbier |
| `src/ui/HeroPanel.ts` | Heldenfenster |
| `tools/import_lpc.py`, `tools/lpc-parts.json` | Import neuer LPC-Teile (Lizenzen in `CREDITS.md` pflegen!) |

## Schnittstellen

- `Appearance`, `dress(body, equipped)`, `buildCharacter`, `Hero`, `finalStats`, `Item`/`Slot`.
- Kampfwerte gehen über `finalStats` an `PlayerCombat` (Modul Kampf).

## Tests

```bash
npx vitest run tests/unit/m5.test.ts tests/unit/m6.test.ts tests/unit/m18.test.ts tests/unit/m23.test.ts
npm run build && npx playwright test tests/e2e/m5-rpg.spec.ts tests/e2e/m6-create.spec.ts tests/e2e/m18-barber.spec.ts tests/e2e/m23-outfit.spec.ts
```

## Regeln

- Neue Grafik nur aus freien Quellen (LPC) oder generiert; Credits in `CREDITS.md`.
- Spielstände von Helden migrieren, wenn sich Felder ändern (oder bewusst zurücksetzen – mit Koordinator klären).
