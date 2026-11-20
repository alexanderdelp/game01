# Modul Netz (geteilte Welt und Live-Spiel)

## Ziel

Mehrere Spieler in derselben persistenten Welt: Teilen per Link/Datei ohne Server (M11), optionaler Sync-Server
und Live-Zusammenspiel (M12).

## Isoliert prüfen

```bash
node server/sync-server.mjs            # Referenz-Server (ohne Abhängigkeiten), dann ?sync=http://localhost:8787
cd server/cloudflare && npm ci && npm run dev   # Cloudflare-Server lokal auf :8788
node server/cloudflare/smoke.mjs [URL] # Rauchtest gegen einen laufenden Server (Ereignisse + WebSocket)
```

## Öffentlicher Server (Cloudflare)

- `server/cloudflare/`: Worker + Durable Object je Welt (SQLite-Speicher, kostenloser Tarif), gleiche Schnittstelle
  wie der Referenz-Server. Adresse: `https://game01-sync.alexanderdelp.workers.dev`.
- Veröffentlichte Spiele gleichen standardmäßig damit ab (`DEFAULT_SYNC_URL` in `src/state/sync.ts`); nicht im
  Testmodus (`?test=1`) und nicht auf localhost (Entwicklung, Vorschau, E2E-Tests).
- Live-Kanal per **WebSocket** (Hibernation: 20 Nachrichten zählen wie eine Anfrage), SSE + POST bleibt als
  Ausweichweg. Präsenz nur bei Änderung, sonst alle 2 s; Abgleich sendet nur Ereignisse, die der Server noch nicht hat.
  Grund: Der kostenlose Tarif erlaubt 100 000 Anfragen pro Tag.
- Deploy: `cd server/cloudflare && set -a && . ~/.config/game01/cloudflare.env && set +a && npx wrangler deploy`
  (Token liegt außerhalb des Repos, nie committen). `CLOUDFLARE_BUILDS_API_TOKEN` dabei nicht setzen.
- E2E-Tests gegen einen laufenden Server: `SYNC_URL=<URL> npx playwright test tests/e2e/netz.spec.ts`.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/state/share.ts`, `src/state/sync.ts` | Link/Datei-Teilen, Abgleich mit dem Server |
| `src/net/live.ts` | Live-Sitzung (WebSocket, sonst Server-Sent Events + POST) |
| `src/entities/RemotePlayers.ts` | Mitspieler darstellen |
| `src/scenes/world/WorldNet.ts` | Chat, Schilder, Übernahme fremder Ereignisse |
| `server/sync-server.mjs` | Referenz-Server (Node, ohne Abhängigkeiten) |
| `server/cloudflare/` | Öffentlicher Server (Cloudflare Worker) |

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

- Keine Fremddienste (STUN, Hoster, Datenbanken) ohne Zustimmung des Nutzers. Cloudflare ist freigegeben (2026-11-20).
- Fog of War bleibt pro Spieler lokal (Nutzerentscheidung).
