# M30 – Regler für die Oberweite (Nutzerwunsch)

## Warum?

Der Nutzer wünscht für Menschen einen Charakterregler, mit dem die Oberweite vergrößert werden kann
(Charakter-Customizing).

## Design

- Regler **„Oberweite“** im Erschaffungsbildschirm für das Volk **Mensch**, Körper **weiblich** (Standard = heutige
  LPC-Figur, dazu 2–3 größere Stufen). Für andere Völker/Körper nicht sichtbar.
- Umsetzung **prozedural** auf den LPC-Ebenen (Körper und darüber liegende Oberteile/Rüstung werden im Brustbereich
  je Richtung und Animationsbild gleich verformt), damit Kleidung zur Figur passt. Stil: Pixel-Art, bekleidet,
  nicht übertrieben; die Silhouette soll in allen 4 Richtungen und Animationen (Laufen, Hieb, Zauber) stimmig bleiben.
- Teil des Körpers → nach der Erschaffung fest (wie Volk/Körper, Entscheidung M18); gespeichert im Aussehen
  (`Appearance`), alte Spielstände = Standard.
- Mitspieler (Netz) sehen es mit, sofern `Appearance` schon übertragen wird.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Regler nur bei Mensch + weiblich; Wert gespeichert, alte Stände = Standard. | Unit + E2E |
| R2 | Figur und Kleidung passen in allen Richtungen und Animationen zusammen (kein Versatz, keine Lücken). | Screenshot-Bogen |
| R3 | Erschaffung/Barbier/Heldenfenster funktionieren wie bisher. | E2E `figur` |

## Ergebnis

Erreicht (Modul Figur, Branch `modul/figur-oberweite`).

- **Wert:** `Appearance.bust` (0–3), `bustAllowed`/`bustLevel` in `src/character/lpc.ts`. `normalizeAppearance`
  begrenzt den Wert und entfernt ihn bei anderen Völkern/Körpern und bei Stufe 0 → alte Spielstände und Figuren
  ohne Regler behalten denselben Figurenschlüssel. Mitspieler sehen es mit, weil `Appearance` übertragen wird.
- **Verformung** (`src/character/bust.ts`): „Schiebe-Verformung“ je Richtung (seitlich nach vorn und etwas nach unten,
  vorn beide Seiten nach außen/unten, hinten nur die Seiten minimal), weich auslaufend, nach oben länger als nach
  unten (flacher Ansatz, runder Abschluss). Dieselbe Abbildung für Körper, `torso/*` und `arms/*` → Kleidung und
  Rüstung passen ohne Lücken; neu entstandene Ränder bekommen die Umrissfarbe der Ebene.
  Kopf, Haare, Beine, Schuhe, Waffe bleiben unverändert.
- **Lage je Bild** über den **Kopf** (eigene, starre, unverdeckte Ebene) statt über den Rumpf: die Arme überdecken
  den Rumpf und machten den Vergleich unzuverlässig. Beim Hieb lehnt sich die Figur bis 4 px vor, die Brust geht mit.
  Liegende Bilder (Treffer/Sterben ab Bild 3) bleiben unverformt. Abbildungen werden je Kopf/Animation/Stufe
  zwischengespeichert (`CharacterFactory.bustFor`).
- **Regler** „Oberweite“ (klein / mittel / groß / sehr groß) im Erschaffungsbildschirm als letzte Zeile (Index 6,
  damit bestehende Zeilenindizes gleich bleiben), nur bei Mensch + weiblich; `fixed` → beim Barbier nicht änderbar.
- **Werkzeug** `tools/preview-bust.ts` (+ PNG-Decoder in `tools/png.ts`) setzt die Ebenen ohne Browser zusammen.

Annahmen: Stufe 3 bleibt bewusst moderat (Seitenansicht +2–3 px), Pixel-Art-Stil vor Übertreibung. Vorn ist die
Änderung naturgemäß kleiner als seitlich.

Nachweis:
- R1: `tests/unit/m30.test.ts` (Regler nur Mensch/weiblich, Standard, Begrenzung, JSON + `dress`), E2E `figur`
  (Zeile 6 nur bei Mensch, Elf verliert den Wert, Erschaffung mit Stufe 3 → gespeichert).
- R2: Unit „keine Lücken“ (in Laufen/Hieb/Stoß/Zauber kommt unter dem Hemd keine neue Haut hervor),
  Screenshot-Bogen `screenshots/m30-{hemd,bluse,korsett,leder,platte,ohne}.png` (Stufe × Richtung, Laufen | Hieb |
  Zauber), Übersicht `screenshots/m30-uebersicht.png`, Erschaffung `screenshots/m30-create.png`
  (`npx vite-node tools/preview-bust.ts`; `SHOTS=1` für das E2E-Bild).
- R3: E2E `figur` (Heldenfenster, Kleidung, Barbier, Speichern mit Menschenfrau Stufe 3; Wert übersteht Barbier und
  Neuladen).
