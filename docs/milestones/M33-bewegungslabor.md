# M33 – Bewegungslabor

Teil des Plans „Kern geradeziehen“ (`docs/PLAN-kern.md`, Phase 1). Ziel: Bewegen über die Karte soll Spaß machen.
Alex probiert Varianten aus und legt danach fest, was ins Spiel kommt. Jede Laborphase endet mit einem Briefing.

Aufruf: `?labor=1` (optional `&ort=<id>`). Nur PC/Tastatur (Touch: Streitpunkt 2 im Plan, Entscheidung im Briefing).

## Laborphasen

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Echtes Gelände, Testszene „Der Berg“, Gegner, Regler fürs Laufen, Stimmung (Nebel, Schnee) | fertig, Abnahme offen |
| 2 | Perspektive als Regler (Neigung, Sichtweite, Zeichenwinkel, Zoom), Grundlage `prototyp/perspektive` | offen |
| 3 | Sprung-Varianten (a) Hindernisse/Lücken, (b) Klippen hinab, (c) Stufen hinauf, (d) Ausweichen im Gelände | offen |

## Anforderungen Laborphase 1

- **L1 Echtes Gelände:** Das Labor lädt einen Ausschnitt der echten Welt (Seed, Kachel) mit Chunks, Hängen, Klippen,
  Treppen, Wald und Wasser. Keine Weltsysteme (NPCs, Orte, Simulation, Fog of War, Netz).
- **L2 Orte:** feste Auswahl im Bedienfeld plus eigener Ort (Seed, x, y). Wechsel ohne Neuladen der Seite.
  - **„Der Berg“** (Seed `gipfel`): Aufstieg von der Tundra über einen langen Schneehang zum Gipfel (Fuß, halbe Höhe,
    Gipfel). Etwa 150 Kacheln Weg, rund 20 Höheneinheiten.
  - **„Klippen“** (Seed `test`, Gebirge nahe dem Start): zerklüftete Stufen. Hinauf geht es dort erst mit den
    Sprüngen aus Phase 3.
- **L3 Gipfel:** Auf dem Gipfel steht ein **Altar**, daneben ein dunkler **Höhleneingang** mit einer **Truhe**
  (Schmugglerversteck, noch ohne Innenraum). Die Truhe lässt sich mit E öffnen.
- **L4 Stimmung:** Nebel (stärker, je höher man steht) und Schneefall (in Schnee- und Gipfelbiomen), beides per Regler.
- **L5 Laufen mit Reglern:** Lauftempo, Anlaufzeit, Abbremszeit, Hangbremse (Stärke, Beginn), bergauf langsamer,
  bergab schneller. Werte bleiben gespeichert und lassen sich als Code kopieren.
- **L6 Gegner:** wie in der Arena per Knopf einsetzen (vor dem Helden), Stufe wählbar, alle entfernen. Derselbe
  Kampf wie in der Arena (`PlayerCombat`, `EnemyManager`), kein zweites Kampfsystem.
- **L7 Kamera:** Zoom per Regler (1–3), ohne die Grenze des festen Sichtausschnitts (M27). Die gehört zu Phase 2.
- **L8 Test:** E2E startet das Labor, prüft Ort, Altar, Gegner und einen Regler. Unit-Tests für Orte und
  Bewegungsrechnung.

## Ergebnis Laborphase 1

- `src/lab/`: `LabScene` (Szene `labor`), `places.ts` (Orte), `labTuning.ts` (Regler, Rechnungen), `atmosphere.ts`
  (Nebel, Schnee; für M35 wiederverwendbar), `labPanel.ts` (Bedienfeld).
- **Ortssuche:** Im Seed `test` ist der nächste Gipfel zu Fuß nicht erreichbar (Klippen ohne Treppe). „Der Berg“ liegt
  deshalb in Seed `gipfel`: von der Tundra (4825, 1017) rund 150 Kacheln über einen Schneehang zum Gipfel
  (4713, 1051), Höhe 2 → 21,6. Der Aufstieg ist ein reiner Hang ohne Stufen. Stufen und Klippen gibt es am Ort
  „Klippen“; hinauf kommt man dort erst mit den Sprüngen (Phase 3).
- Altar = Schrein-Grafik auf der höchsten freien Kachel. Höhle = gezeichneter Felshügel mit dunklem Eingang, 4–9
  Kacheln entfernt auf freiem Grund, Truhe davor (E öffnet).
- Die Hangbremse (`SLOPE` in `world/terrain.ts`) ist jetzt ein Objekt. Regler im Labor wirken deshalb mit denselben
  Werten wie im Spiel. Anlauf, Abbremsen sowie bergauf/bergab gibt es (noch) nur im Labor (`LAB_MOVE`); die
  Standardwerte 0 entsprechen dem heutigen Spiel.
- Die Anzeige zeigt Höhe, Steigung in Laufrichtung, gemessenes Tempo sowie Richtung und Entfernung zum Gipfel.
- **Bekannt:** keine Sicht- und Fog-Regeln im Labor; Gegner kennen keine Höhe; Spielerdaten (Aussehen) kommen vom
  zuletzt gespielten Helden.

### Feedback 2026-11-21 (Alex) und Umsetzung

- Schnee wackelte mit der Kamera → Flocken entstehen jetzt in Weltkoordinaten über dem Ausschnitt.
- Nach dem Einstellen eines Reglers ließ sich die Figur nicht mehr steuern (Fokus blieb im Regler) → Regler und
  Auswahl geben den Fokus zurück (auch in der Kampf-Arena).
- Weg zum Gipfel nicht erkennbar → Wegweiser alle 16 Kacheln entlang eines begehbaren Wegs (`trail` in `places.ts`).
- Höhen in der Draufsicht nicht lesbar, Nebel ohne erkennbaren Höhenbezug, Bewertung ohne Perspektive nicht
  möglich → Laborphase 2 (Perspektive) ist der nächste Schritt; Höhendarstellung wird dort mitgeprüft.
