# Übergabe – Rechnerwechsel (2026-11-26)

Stand für den Umzug auf einen neuen Rechner: Was offen ist und wie man dort weitermacht.
Alles Weitere steht in [CLAUDE.md](../CLAUDE.md) und [PLAN-kern.md](PLAN-kern.md).

## Stand

- `main` = **0.36.0** (`c5cf1a7`, PR #12 „M33 Laborphase 2: Perspektive“), CI grün. Nichts liegt nur lokal: keine
  ungepushten Commits, keine Stashes, keine offenen PRs oder Issues.
- `release` = **0.32.2**. Auf `main` warten 0.33.0–0.36.0 (M32 Kernmodus, M33 Laborphasen 1–2, Plan „Kern geradeziehen“)
  auf die Freigabe von Alex (Release-PR `main` → `release`).
- Prototyp-Branches, beide zuletzt am 2026-11-20 mit `main` zusammengeführt und seitdem hinter `main`:
  - `prototyp/vorgeschichte`: 6 Commits hinter `main`. Vorschau: https://prototyp-vorgeschichte.welten.bytekaska.de/?legends=1&seed=nebel-kristall-427
  - `prototyp/perspektive`: 2 Commits hinter `main`. Grundlage für M33 Laborphase 2.

## Offen

### Abnahmen und Entscheidungen von Alex (Plan „Kern geradeziehen“)

1. **M33 Laborphase 1** (Gelände, „Der Berg“, Laufregler, Nebel/Schnee): fertig, Abnahme offen.
2. **M33 Laborphase 2** (Perspektive als Regler, 0.36.0): fertig, Briefing und Abnahme offen. Danach legt Alex die
   **Perspektiven-Spanne** fest. Erst dann wird die Perspektive fürs Spiel festgegossen.
3. **M33 Laborphase 3** (Sprung-Varianten a–d): noch nicht begonnen.
4. **Streitpunkt 1:** Woher kommt der Weltzustand für Phase 3? Vorgeschichte als einzige Quelle oder `meta.ts`.
   Entscheidung vor M35.
5. **Streitpunkt 2:** Touch-Steuerung sofort mitdenken oder erst nach der Tastatur-Abnahme. Entscheidung im Briefing
   zu Phase 1.
6. **Release** 0.33–0.36 nach `release` freigeben.

### Danach laut Plan

- M34 Kampf im Gelände → M35 „Der Berg“ im Spiel → ab M36 Systeme einzeln zurückholen. Bis zur Abnahme der Phasen 1–3
  gilt der **Feature-Freeze**.
- Aus dem Feedback zu M32: „Die Welt ist noch viel zu groß.“ Wird mit M35 behandelt.

### Länger offen (CLAUDE.md)

- Klassen und Skilltrees (`docs/VORSCHLAG-aussehen-voelker.md`).
- Ideen: Spielweise je Volk, Reaktionen der Fraktionen auf Völker, Rüstungsgrenzen je Volk, Umfärben beim Schneider.

### Technisch

- **Wackliger Unit-Test:** `tests/unit/m18.test.ts` („jede wählbare Kombination nutzt nur vorhandene Bilder“) dauert
  rund 12 s. Am 2026-11-09 schlug er einmal von vier Läufen fehl, vermutlich wegen des Zeitlimits. Er sollte schneller
  werden oder ein eigenes Zeitlimit bekommen.
- Im Software-Rendering (CI, Headless) läuft die Perspektive mit wenigen Bildern je Sekunde (siehe M33).

## Neuen Rechner einrichten

1. Werkzeuge: Git, Node 22 oder neuer, GitHub CLI (`gh auth login` als `alexanderdelp`), Python 3 (nur für
   `tools/import_lpc.py`).
2. Klonen. Unter Windows sind lange Pfade nötig:
   ```bash
   git -c core.longpaths=true clone https://github.com/alexanderdelp/game01.git
   cd game01
   git config core.longpaths true
   git config core.hooksPath scripts/git-hooks   # pre-push-Schutz für release
   git config user.name alexanderdelp
   git config user.email 39568267+alexanderdelp@users.noreply.github.com
   ```
3. Abhängigkeiten installieren:
   ```bash
   npm ci
   npx playwright install chromium
   npm run check   # Unit-Tests, Build, E2E
   ```
4. **Zugangsdaten (nie ins Repository):** Diese Dateien vom bisherigen Arbeitsrechner nach `~/.config/game01/`
   übernehmen:
   - `cloudflare.env` mit `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_BUILDS_API_TOKEN`
   - `telegram.env` für `tools/telegram.mjs`

   Auf dem Rechner mit `C:\development\projects\game01` lagen sie nicht. Falls sie verloren sind, neue Tokens im
   Cloudflare-Dashboard bzw. bei @BotFather erzeugen.
5. Cloudflare Workers Builds baut aus GitHub, lokal ist dafür nichts nötig. Nur der Sync-Server (`game01-sync`) wird von
   Hand mit Wrangler deployt (`docs/modules/netz.md`).
