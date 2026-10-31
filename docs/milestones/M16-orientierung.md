# M16 – Lesbarkeit & Orientierung (aus Feedback-Runde 1)

## Warum?

Spieltest am PC (`docs/FEEDBACK-2026-10-31.md`, Punkte 1–3): Texte verschwinden zu schnell, der Pfeil zum Questgeber
zeigt ins Leere, und eine Minimap fehlt. Das stört „casual“ (man versteht nicht, was los ist) und „Erkundung“
(man verliert die Orientierung).

## Design

- **Banner-Warteschlange:** Jedes Banner steht mindestens 5 s. Neue Banner warten, statt das alte zu ersetzen.
  Gleiche Titel werden nicht doppelt eingereiht.
- **Einstiegshinweise** bleiben stehen, bis man klickt (sofort weg) oder losläuft (dann nach den 5 s weg).
- **Questziele:**
  - Ist das Ziel ein **NPC** (Questgeber, Briefempfänger) und dieser geladen, zeigt der Pfeil auf **den NPC selbst**.
  - Ist er nicht geladen, gibt es **keinen Pfeil**. Stattdessen zeigen Minimap und Karte einen **ungefähren Kreis** um
    sein Zuhause, und der Tracker schreibt „bei <Ort> (<Richtung>, <Entfernung>)“.
  - Orte (Erkundung, nächster Wegstein) behalten den Pfeil.
  - Questgeber mit **abgabebereiter** Quest bleiben stehen (kein Wandern).
- **Minimap** oben rechts (unter den Handy-Knöpfen): Umgebung aus der Übersichtskarte, Spieler, Orte,
  Questziele (Punkt oder Kreis), Karawanen und Mitspieler. Der Quest-Tracker rückt darunter.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Banner-Warteschlange: ≥ 5 s je Banner, Reihenfolge erhalten, Dubletten verworfen, Hinweise bis Klick/Loslaufen. | Unit |
| R2 | `questTarget` kennzeichnet NPC-Ziele; Ortsbeschreibung „bei <Ort>“ für das ungefähre Gebiet. | Unit |
| R3 | Pfeil nur auf geladene NPCs; sonst kein Pfeil, Gebiet im Tracker. Questgeber mit fertiger Quest bleibt stehen. | E2E |
| R4 | Minimap sichtbar, zeigt Spieler und Questziel; Screenshot Desktop + Handy. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R1, R2 per Unit-Test (`tests/unit/m16.test.ts`, `m7.test.ts`), R1, R3, R4 per Akzeptanztest
(`tests/e2e/m16-orientation.spec.ts`).

- Warteschlange als reine Klasse `src/ui/bannerQueue.ts`; die vier Einstiegshinweise stehen sofort alle in der
  Schlange und zeigen „(klicken oder loslaufen)“.
- Minimap: 1 Bildpunkt der Übersichtskarte (8 Kacheln) = 4 Bildschirmpixel → Ausschnitt ca. 300 × 300 Kacheln am PC,
  200 × 200 am Handy. Bekannte Orte türkis, unbekannte weiß/gelb, Karawanen orange.
- Ungefähres Gebiet: Kreis mit 14 Kacheln Radius um das Zuhause; liegt es außerhalb, sitzt der Kreis am Rand der
  Minimap in Zielrichtung.
