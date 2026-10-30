# M4 – Kampfmechanik & bekämpfbare NPCs

## Ziel

Einfache, spaßige Action im Stil von Secret of Mana: zuschlagen, treffen, Gegner fliegen zurück, Zahlen poppen.
Gegner passen zur Gegend und zum Genre-Mix (Fantasy-Schleime, Irrlichter, Räuber, Cyber-Drohnen).

## Design

### Spieler
- **Angriff:** Leertaste / J (Touch: Button „Angriff“). Dolchhieb (LPC-Slash, 6 Frames), Trefferfenster in der Mitte der
  Animation, Trefferbox vor der Figur in Blickrichtung. Kurze Abklingzeit, man kann aber flüssig weiterhauen.
- **Leben:** 100 LP, HUD-Leiste. Nach 4 s ohne Treffer regeneriert man langsam (casual: kein Heiltrank-Zwang).
- **Getroffen werden:** roter Blitz, Rückstoß, 0,8 s unverwundbar.
- **Tod:** Zusammensacken (LPC-„hurt“), Ausblenden, Erwachen am Startpunkt mit vollem Leben. Keine Strafe (casual).
- **Interaktion:** Reden wandert auf E (Touch: „Reden“), Leertaste ist jetzt Angriff.

### Gegner
| Gegner | Vorkommen | Verhalten |
|---|---|---|
| Schleim (Farbe je Biom) | Grasland, Wald, Sumpf, Dschungel, Wüste, Schnee | hüpft herum, springt den Spieler an (Kontaktschaden) |
| Räuber (LPC) | Wald, Savanne, Wüste, Grasland | läuft hin, holt aus (Vorwarnzeit), Dolchhieb |
| Drohne (Cyber) | Schrottödnis, Gebirge | hält Abstand, schießt langsame Energiekugeln |
| Irrlicht (Magie) | Kristallhain, Sumpf, Tundra | schwebt, stürzt sich in schnellen Dashes auf den Spieler |

- **Seed-basiert** pro Chunk (0–3 Gegner), nicht in der Sicherheitszone um den Startpunkt (16 Kacheln).
- **Stufe** steigt mit der Entfernung vom Startpunkt → LP/Schaden skalieren. (Erfahrung/Belohnung: M5.)
- **Verhalten:** Herumstreifen → bei Sichtweite verfolgen → angreifen → zu weit von Zuhause: zurückkehren und heilen.
- **Treffer:** weißer Blitz, Rückstoß, kurzes Taumeln, Schadenszahl, Lebensleiste über dem Gegner.
- **Besiegt:** zerplatzt (Partikel) und bleibt in dieser Sitzung 5 min verschwunden (dauerhaft: M9).
- Neutrale NPCs sind nicht angreifbar.

### Grafik
- Schleim, Drohne, Irrlicht: prozedural animiert (Frames im Code erzeugt), Energiekugeln ebenso.
- Räuber: LPC-Figuren mit Lederrüstung und Dolch; der Spieler trägt ebenfalls einen Dolch (LPC „dagger“).

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Angriff mit Animation, Trefferbox in Blickrichtung, Schaden mit Streuung, Rückstoß. | Unit (Kampflogik) + E2E |
| R2 | Gegner erscheinen seed-basiert passend zum Biom, nie in der Sicherheitszone; Stufe skaliert mit Entfernung. | Unit |
| R3 | Gegner verfolgen und greifen an (Nahkampf, Sprung, Fernkampf, Dash). | E2E |
| R4 | Spieler kann Schaden nehmen, hat Unverwundbarkeit, regeneriert, stirbt und erwacht am Startpunkt. | Unit + E2E |
| R5 | Rückmeldung: Blitz, Schadenszahlen, Lebensleisten, Platzen. | Screenshot |
| R6 | Besiegte Gegner bleiben eine Weile weg. | Unit |
| R7 | Touch-Button für Angriff. | E2E |

## Ergebnis

Erreicht am 2026-10-30. R1, R2, R4, R6 per Unit-Test (`tests/unit/m4.test.ts`), R1, R3, R4, R7 per Akzeptanztest
(`tests/e2e/m4-combat.spec.ts`), R5 per Screenshot (`tests/e2e/shots.mjs` erzeugt Gegner-Screenshots).

Anpassungen während der Umsetzung:
- Waffe: LPC-Dolch (passt ins 64-px-Raster). Größere Waffen (Übergrößen-Frames) kommen mit der Ausrüstung in M5/M6.
- Gegner-KI liegt in `entities/Enemy.ts` (Zustände Herumstreifen → Verfolgen → Ausholen → Angriff → Rückkehr), reine Werte- und
  Trefferlogik in `combat/combat.ts`, Auftreten in `combat/enemies.ts`.
- `ChunkManager` meldet Laden/Entladen jetzt an beliebig viele Zuhörer (NPCs und Gegner).
