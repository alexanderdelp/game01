# M11 – Gemeinsame, persistente Welt für asynchron spielende Spieler

## Ziel

1–3 Freunde spielen **dieselbe** Welt zu unterschiedlichen Zeiten und sehen, was die anderen getan haben:
geöffnete Truhen, aufblühende Orte, Statuen, entdeckte Obelisken, hinterlassene Botschaften.

## Ausgangslage & Entscheidung

- Landschaft, Reiche, Orte, Chronik und Simulation sind bereits **Funktionen von Seed + Uhrzeit** → bei allen identisch.
- Alles Spielergemachte steckt im **Ereignisprotokoll** (M9). Teilen heißt also: Protokolle **zusammenführen**.
  Ereignisse sind unveränderlich und eindeutig (Spieler-ID + Zeit + Art + Ziel) → Vereinigungsmenge ist konfliktfrei.
- Ein dauerhafter Online-Server braucht ein Konto bei einem Dienst (vom Nutzer anzulegen). Deshalb zwei Stufen:
  1. **Teilen per Link (ohne Server, sofort nutzbar):** Das Protokoll wird komprimiert in den Link-Anker (`#w=…`) gepackt.
     Wer den Link öffnet, übernimmt die Ereignisse. Der Anker wird nie an einen Server gesendet. Zusätzlich Export/Import als Datei.
  2. **Automatischer Abgleich (optional):** `SyncClient` spricht ein kleines REST-Protokoll (`GET/POST /worlds/:seed/events`).
     Ein Referenz-Server liegt bei (`server/sync-server.mjs`, ohne Abhängigkeiten) und wird in den Tests lokal benutzt.
     Aktivierung über `?sync=<URL>`. Sobald der Nutzer einen Server betreibt, ist die Welt live geteilt.

## Design

- **Spieler-Identität:** zufällige Spieler-ID (lokal), Anzeige-Name = Heldenname. Ereignisse tragen `by` (Name) und `pid`.
- **Botschaften (asynchrones Miteinander):** Wegweiser mit kurzem Text an jeder Stelle aufstellen (T, Touch: „Schild“).
  Andere lesen sie mit E. Max. 80 Zeichen.
- **Gefallen-Marker:** Wo ein Held fällt, steht ein kleiner Grabstein „Hier fiel …“ (verschwindet nach einem Tag).
- **Sichtbarkeit fremder Taten:** Statue zeigt den Helden mit den meisten Quests im Ort; „entdeckt von …“, „geöffnet von …“;
  Neuigkeiten enthalten Taten anderer Spieler seit dem letzten Besuch.
- **Teilen-Fenster** (Taste G, Touch: „Teilen“): Link kopieren, Datei exportieren/importieren, Sync-Status, Mitspieler-Liste.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Zusammenführen von Protokollen ist kommutativ, idempotent, ohne Duplikate. | Unit |
| R2 | Teilen-Link enthält Seed + Protokoll; Öffnen übernimmt fremde Ereignisse (Truhen, Orte, Statuen, Botschaften). | E2E |
| R3 | Botschaften setzen/lesen; Gefallen-Marker. | E2E |
| R4 | Sync-Client gleicht mit dem Referenz-Server ab: zwei Browser sehen gegenseitig ihre Taten. | E2E (lokaler Server) |
| R5 | Fremde Taten erscheinen mit Namen (Statue, Neuigkeiten, Truhen). | E2E + Screenshot |

## Ergebnis

Erreicht am 2026-10-31. R1 per Unit-Test (`tests/unit/m11.test.ts`), R2–R5 per Akzeptanztest mit zwei getrennten
Browser-Kontexten (`tests/e2e/m11-shared.spec.ts`), davon R4 gegen den lokal gestarteten Referenz-Server.

### So spielt man gemeinsam
- **Ohne Server:** Teilen-Fenster (G) → „Link kopieren“ → an Freunde schicken. Sie öffnen den Link und spielen in derselben
  Welt weiter; umgekehrt genauso. (Auch als Datei möglich.)
- **Mit Server (automatisch):** `node server/sync-server.mjs 8787` irgendwo betreiben (z. B. kleiner VPS, Render, Fly.io,
  Raspberry Pi mit HTTPS) und das Spiel mit `?seed=<welt>&sync=https://<server>` öffnen. Die Adresse wird gemerkt.
  Für GitHub Pages (HTTPS) muss der Server ebenfalls HTTPS sprechen.

Anpassungen während der Umsetzung:
- Ereignisse tragen eine Spieler-ID (`pid`, zufällig je Browser) für konfliktfreies Zusammenführen.
- Neue Ereignisarten: Botschaft (`sign`), Gefallen-Marker (`death`, 24 h sichtbar).
- Statue zeigt den Helden mit den meisten Quests im Ort; Truhen verraten, wer schneller war.
