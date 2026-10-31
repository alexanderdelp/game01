# M12 – Gemeinsames Spielen mehrerer Spieler (live)

## Ziel

1–3 Spieler sind gleichzeitig in derselben Welt: Sie sehen sich laufen, kämpfen gemeinsam gegen dieselben Gegner,
teilen Erfahrung und können sich kurze Nachrichten schicken.

## Entscheidung Technik

- Live-Kanal über den **Referenz-Server aus M11** (`server/sync-server.mjs`): Server-Sent Events (Empfang) +
  HTTP-POST (Senden). Nur Standard-Web-Techniken, keine Abhängigkeiten, keine Fremddienste. Aktivierung wie M11 mit `?sync=<URL>`.
- Alternative ohne Server (WebRTC mit Einladungscode) ist möglich, braucht aber für Verbindungen über das Internet einen
  STUN-Dienst eines Dritten → bewusst nicht ohne Zustimmung des Nutzers eingebaut (dokumentiert als Option).

## Design

- **Präsenz:** 10× pro Sekunde Position, Blickrichtung, Bewegung, LP und Aussehen. Andere Spieler erscheinen als
  LPC-Figur mit Namensschild und Lebensleiste, Bewegungen werden geglättet. Nach 5 s ohne Meldung verschwinden sie.
- **Gemeinsamer Kampf (Lite-Koop):** Gegner sind seed-basiert identisch. Treffer werden als Ereignis (Gegner-ID, Schaden)
  gesendet und bei allen angewendet → ein Gegner stirbt für alle. Gegner verfolgen den **nächsten** Spieler (lokal oder
  entfernt). **Gruppenerfahrung:** Wer in der Nähe ist (≤ 15 Kacheln), bekommt die EP mit.
- **Chat:** Enter (Touch: „Chat“) → kurze Nachricht als Sprechblase über der Figur und im Nachrichtenverlauf.
- **Grenzen:** Spielerhandlungen ohne Live-Bezug laufen weiterhin über das Ereignisprotokoll (M11). Dungeons für live
  Gruppen sind ein späterer Ausbau.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Nachrichtenformat (Präsenz, Treffer, Chat) wird korrekt erzeugt/ausgewertet; veraltete Spieler fallen weg. | Unit |
| R2 | Zwei Browser sehen sich gegenseitig laufen (Position kommt beim anderen an). | E2E (lokaler Server) |
| R3 | Treffer eines Spielers schaden dem Gegner auch beim anderen; Gruppenerfahrung. | E2E |
| R4 | Chat-Nachricht erscheint beim anderen. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1 per Unit-Test (`tests/unit/m12.test.ts`), R2–R4 per Akzeptanztest mit zwei Browsern und lokalem
Referenz-Server (`tests/e2e/m12-live.spec.ts`).

### So spielt man live zusammen
Server starten (`node server/sync-server.mjs 8787`, öffentlich per HTTPS erreichbar) und alle öffnen
`https://alexanderdelp.github.io/game01/?seed=<gemeinsame-welt>&sync=https://<server>`. Enter = Chat.

Anpassungen während der Umsetzung:
- Präsenz wird höchstens 10×/s gesendet; liegt eine Sendung noch in der Leitung, wird nur der neueste Zustand nachgeschickt.
- Mitspieler-Aussehen wird bei Bedarf nachgeladen (LPC-Ebenen), dann als Figur gezeigt.
- Treffer aus dem Netz werden in Hellblau angezeigt; Gruppenerfahrung im Umkreis von 15 Kacheln.
