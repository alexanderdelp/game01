# M18 – Charaktereditor 2 (aus Feedback-Runde 1)

## Warum?

Spieltest (`docs/FEEDBACK-2026-10-31.md`, Punkt 5): Haut, Oberteil und Stiefel ließen sich nicht sichtbar umfärben,
die Hose wirkte wie eine Unterhose, die Völker waren sich zu ähnlich, weibliche Figuren kaum als solche erkennbar,
und weibliche Frisuren fehlten. Außerdem soll das Aussehen nicht einfach im Heldenfenster änderbar sein.

## Befund

- **Umfärben:** Im Testbrowser funktionierte es. Viele LPC-Bilder tragen aber Farbraum-Angaben (`sRGB`, `cHRM`,
  `gAMA`). Browser mit Farbmanagement (z. B. Firefox, kalibrierte Bildschirme) rechnen die Pixel beim Laden um, und
  die exakte Palettensuche fand ihre Farben nicht mehr → nichts wurde umgefärbt, nur zufällig passende Pixel (Ohr).
- **„Unterhose“:** Die hohen Stiefel verdeckten die Hose fast vollständig; sichtbar blieb nur ein Streifen an der Hüfte.

## Design

- Farbraum-Angaben werden beim Import entfernt (`tools/import_lpc.py`), und das Umfärben erkennt leicht verschobene
  Palettenfarben (Abstand ≤ 14 je Kanal) als Sicherheitsnetz.
- **Schuhwerk:** Schuhe (Standard, Hose sichtbar) oder Stiefel.
- **Völker deutlicher:**
  - Ork (männlich): muskulöser Körper, Oberkörper frei oder Hemd; Ork-Kopf.
  - Elf: lange, spitze Ohren.
  - Synth: **Panzerplatten statt Kleidung** (Rumpf, Arme, Beine) in Metallfarben (Silber, Stahl, Eisen, Messing, …)
    – Nutzerentscheidung.
- **Weibliche Figuren:** eigene Schnitte (Hemd, Rundausschnitt, Bluse, Korsett), Männer: Hemd, V-Ausschnitt.
- **Neue Frisuren:** Pferdeschwanz, Zopf, Dutt, Zöpfe (Pferdeschwanz und Zopf mit Ebene hinter dem Körper).
- **Barbier** in jeder Siedlung (neben dem Händler): Frisur, Haarfarbe, Kleidung und Schuhe gegen **20 ◆**, nur wenn
  man etwas ändert. Volk, Körper und Haut bleiben fest. Das Heldenfenster hat keinen „Aussehen“-Knopf mehr.
- NPCs bekommen die neuen Frisuren und Schnitte, ohne dass sich die übrigen seed-basierten Werte der Welt ändern.

## Anforderungen

| # | Anforderung | Nachweis |
|---|---|---|
| R1 | Umfärben robust gegen Farbmanagement; keine Farbraum-Angaben in den Bildern. | Unit + Import |
| R2 | Jede wählbare Kombination nutzt nur vorhandene Bilder. | Unit |
| R3 | Völker unterscheiden sich im Körperbau (Ork muskulös, Elf Ohren, Synth Panzerplatten). | Unit + Screenshot |
| R4 | Weibliche Schnitte und Frisuren; Schuhe/Stiefel wählbar. | Unit + E2E |
| R5 | Barbier in jeder Siedlung, Preis 20 ◆, Volk/Körper/Haut fest; kein Aussehen-Knopf im Heldenfenster. | Unit + E2E |

## Ergebnis

Erreicht am 2026-10-31. R1–R5 per Unit-Test (`tests/unit/m18.test.ts`), R3–R5 per Akzeptanztest
(`tests/e2e/m18-barber.spec.ts`, angepasst: `m6-create.spec.ts`).

- Neue LPC-Teile (CC-BY-SA/GPL, Credits in `public/assets/lpc/CREDITS-LPC.csv`): Frisuren ponytail, braid,
  bangs_bun, pigtails; Oberteile longsleeve2_vneck/scoop, blouse, blouse_longsleeve, corset; Plattenpanzer
  (Rumpf, Arme, Beine); muskulöser Körper samt Hose; Schuhe; lange Ohren; Metallpalette.
- Das Importskript übernimmt Credits einer fehlenden Animation von der Geh-Animation desselben Teils (Lücke im
  Upstream-CSV bei `legs/pants/muscular/idle`).
- Synth-Leuchtakzente (Implantat-Glühen) sind noch offen → Kandidat für eine spätere Runde.
