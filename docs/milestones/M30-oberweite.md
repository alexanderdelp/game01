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

_offen_
