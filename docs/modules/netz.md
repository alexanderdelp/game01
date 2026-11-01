# Modul Netz (geteilte Welt und Live-Spiel)

## Ziel

Mehrere Spieler in derselben persistenten Welt: Teilen per Link/Datei ohne Server (M11), optionaler Sync-Server
und Live-Zusammenspiel (M12).

## Isoliert prüfen

```bash
node server/sync-server.mjs            # Referenz-Server (ohne Abhängigkeiten), dann ?sync=http://localhost:8787
```

## Dateien

| Datei | Inhalt |
|---|---|
| `src/state/share.ts`, `src/state/sync.ts` | Link/Datei-Teilen, Abgleich mit dem Server |
| `src/net/live.ts` | Live-Sitzung (Server-Sent Events + POST) |
| `src/entities/RemotePlayers.ts` | Mitspieler darstellen |
| `src/scenes/world/WorldNet.ts` | Chat, Schilder, Übernahme fremder Ereignisse |
| `server/sync-server.mjs` | Referenz-Server |

## Schnittstellen

- Ereignisprotokoll aus `src/state/worldState.ts` (Modul Weltenbau) – Format nur additiv ändern.
- `LiveMsg`-Typen sind ein Vertrag zwischen Clients verschiedener Versionen.

## Tests

```bash
npx vitest run tests/unit/m11.test.ts tests/unit/m12.test.ts
npm run build && npx playwright test tests/e2e/netz.spec.ts
```

Grundsätze und Hilfen für Tests (Polling statt Wartezeit, Bewegen nach Bildern, `SHOTS=1`): `docs/TESTS.md`.

## Regeln

- Keine Fremddienste (STUN, Hoster, Datenbanken) ohne Zustimmung des Nutzers.
- Fog of War bleibt pro Spieler lokal (Nutzerentscheidung).
