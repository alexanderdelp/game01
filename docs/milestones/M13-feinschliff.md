# M13 – Feinschliff & Spielgefühl (zusätzlicher Meilenstein)

## Warum ein zusätzlicher Meilenstein?

Alle zwölf technischen Meilensteine waren um 01:54 erreicht. Die verbleibende Zeit fließt in das, was die Wünsche
„casual spielbar“ und „immersiv“ am stärksten verbessert, aber in keinem Meilenstein vorkam:

1. **Aufgeräumte Handy-Bedienung:** Statt zwölf Buttons ein großer Angriffs- und ein Aktionsknopf (Reden/Benutzen) sowie ein
   **Menü** (☰) mit allen Fenstern. Auf dem Handy bleibt so die Welt sichtbar.
2. **Titelbildschirm:** Welt fortsetzen, zuletzt gespielte Welten, neue Zufallswelt oder eigener Seed – ohne die URL anzufassen.
3. **Musik & Klänge:** prozedural per Web Audio (keine Lizenzfragen): ruhige Melodie je Tageszeit/Region, Klänge für Treffer,
   Beute, Aufstieg, Quest. Ein/aus im Menü, Einstellung wird gemerkt.
4. **Einstieg:** kurze Hinweise beim ersten Spielen (Steuerung, erste Quest, Weg zum nächsten Ort).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Handy: Menü öffnet alle Fenster; Aktionsknopf redet/benutzt. | E2E (Touch) |
| R2 | Titelbildschirm: fortsetzen, neue Welt, eigener Seed. | E2E |
| R3 | Musik/Klänge erzeugbar, stummschaltbar, Einstellung bleibt. | Unit (Noten/Tonleiter) + E2E |
| R4 | Einstiegshinweise erscheinen beim ersten Mal, danach nicht mehr. | E2E |

## Ergebnis

Erreicht am 2026-10-31. R3 per Unit-Test (`tests/unit/m13.test.ts`), R1, R2, R4 per Akzeptanztest (`tests/e2e/m13-polish.spec.ts`).

- Das Spiel heißt jetzt **„Splitterwelten“** (aus dem World Building: Kristallsplitter verbinden Magie und Maschine).
- Ohne `?seed=` in der Adresse startet der Titelbildschirm; Welten werden als „zuletzt gespielt“ gemerkt.
- Handy: oben rechts nur „☰“ und „Karte“, unten rechts ⚔ (Angriff), E (Reden/Benutzen) und ♥ (Trank mit Anzahl).
- Ohne aktive Quest zeigt der gelbe Pfeil zum nächsten unbesuchten Ort.
- Musik passt sich an: Tag (Dur-Pentatonik), Nacht (Moll, langsamer), Technokratie-Reiche (Cyber-Klang).
