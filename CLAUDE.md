# CLAUDE.md – Game01

## Wünsche an das Spiel

- **Casual spielbar:** Kurz rein, wieder raus soll machbar sein. Regeln / Mechaniken einfach halten.
- **Immersiv:** Die Welt entwickelt sich weiter, man erlebt Geschichten.
- **Relevante Entscheidungen:** Handlungen prägen die Welt dauerhaft.
- **Lebendige Welt:** Dinge passieren auch ohne den Spieler, die Welt wartet nicht nur auf ihn.
- **Erkundung:** Geheimnisse und interessante Dinge finden.
- **Große Spielwelt:** Prozedural generierte, persistente Spielwelt (bspw. aus einem Seed wie Elite).
- **Charakterentwicklung:** Die Spielfigur wird stärker und verändert sich.
- **Charakter-Customizing:** Man hat einen Einfluss auf Aspekte der Spielfigur.
- **Genres:** High-Fantasy featuring Cyberpunk.
- **Kampf:** Einfache, spaßige Action.
- **Multiplayer:** Mit 1-3 Spielern in derselben, persistenten Welt unterwegs. Auch Möglichkeiten für live zusammenspielen.
- **Grafik:** Pixel-Art (Vorbilder: Secret of Mana).

## Rahmenbedingungen

- **Claude Code entwickelt komplett allein.** Der Nutzer programmiert nicht mit.
- **Keine eigene Grafik:** Assets kommen aus freien Quellen oder werden generiert.
- **Iterative Entwicklung:** Schnell erste spielbare Versionen, dann schrittweise ausbauen.

## Ergebnis der Analyse

Als Genre liegt ein **Action-RPG mit offener Welt und Weltsimulation** nahe.

### Technik-Empfehlung

- **Browser-Spiel mit TypeScript und Phaser.** Claude Code kann es selbst bauen, automatisiert testen und per Screenshot prüfen. Spielen geht per Link, auch für Mitspieler.
- **Assets: LPC (Liberated Pixel Cup)** von OpenGameArt. Modulare Charakter-Sprites mit Körper, Haaren, Kleidung und Rüstung, also Customizing fast ohne Aufwand. Stil nah an Secret of Mana. Lizenzen (CC-BY-SA / GPL) beachten und Credits pflegen.

### Kernidee: geteilte, persistente Welt

Die Welt läuft in Echtzeit weiter, auch wenn niemand spielt. Fraktionen expandieren, Händler ziehen umher, Siedlungen wachsen oder verfallen. Freunde können **asynchron** in derselben Welt spielen und sehen die Folgen der Taten der anderen. Es kann aber auch (vor allem für spezielle Herausforderungen wie Dungeons) live zusammen gespielt werden.

## Welt

- Unterschiedliche Biome & Reiche tragen zu einer vielfältigen Welt bei.

## Reihenfolge iterative Entwicklung

Zunächst technische Meilensteine, die noch nicht die letztendliche Ausgestaltung der Welt beinhalten. Es soll aber eine prototypische Spielbarkeit der bis dahin entwickelten Systeme ermöglicht werden.

Erfülle einen technischen Meilenstein nach dem anderen. Sollte es gute Gründe geben, die Meilensteinplanung anzupassen, nimm Anpassungen eigenverantwortlich vor und dokumentiere sie kurz.

1. Technischer Meilenstein: Prozedural aus einem Seed generierbare, offene & weite Welt
2. Technischer Meilenstein: Eigener Avatar zum Bewegen in der Welt
3. Technischer Meilenstein: Sich bewegende, neutrale NPCs in der Welt
4. Technischer Meilenstein: Kampfmechanik & bekämpfbare NPCs
5. Technischer Meilenstein: Charakter-RPG-Mechaniken (Werte, Ausrüstung, Progression, ...)
6. Technischer Meilenstein: Charakter-Gestaltungs-Mechaniken (Rasse, Aussehen, ...)
7. Technischer Meilenstein: Questing Mechaniken
8. Technischer Meilenstein: World Building & Story Mechaniken (Seed-basiert)
9. Technischer Meilenstein: Persistenz von Entscheidungen & Handlungen
10. Technischer Meilenstein: Lebendigkeit der Welt ohne Spieleraktionen
11. Technischer Meilenstein: Gemeinsame, persistente Welt für asynchrone spielende Spieler
12. Technischer Meilenstein: Gemeinsames Spielen mehrerer Spieler

### Dokumentation vorgenommener Anpassungen

- 2026-10-30 – M2: Maßstab auf 32-px-Kacheln geändert (LPC), siehe `docs/milestones/M02-avatar.md`.
- 2026-10-31 – M11/M12: Online-Teil zweistufig (Link-Teilen ohne Server + optionaler eigener Sync-Server), weil ein dauerhafter Server ein Konto des Nutzers braucht.
- 2026-10-31 – **Zusätzlicher Meilenstein 13 „Feinschliff & Spielgefühl“** (Titelbildschirm, Handy-Menü, Musik/Klänge, Einstiegshinweise): alle 12 Meilensteine waren um 01:54 erreicht; die Restzeit fließt in „casual“ und „immersiv“.
- 2026-10-31 – **Zusätzlicher Meilenstein 14 „Erkundung & Herausforderung“** (Elite-Gegner, Ruinen mit Wächter und Schatz) – stärkt „Erkundung“ und „spaßige Action“.
- 2026-10-31 – **Zusätzlicher Meilenstein 15 „Fraktionstreue“** (Treueschwur beim Herrscher mit Vor- und Nachteilen, verschiebt Reichsgrenzen) – eine echte „relevante Entscheidung“.
- 2026-10-31 – **Feedback-Runde 1** (`docs/FEEDBACK-2026-10-31.md`) ergibt die Meilensteine:
  - **M16 „Lesbarkeit & Orientierung“**: Banner-Warteschlange (≥ 5 s), Pfeil nur auf geladene NPCs, sonst Gebiet + Text, Minimap.
  - **M17 „Kampfgefühl“**: Bewegung während des Schlags, kürzere Verzögerungen, direkte Steuerung (Leitbild Super Mario World). Arena nur bei Bedarf.
  - **M18 „Charaktereditor 2“**: Umfärbe-/Ebenen-Fehler beheben, Völker deutlicher, weibliche Statur, neue Frisuren, Synth mit Implantaten statt Kleidung, Aussehen nur noch beim Barbier.
  - **M19 „Organische, weite Welt“**: Biome für 1–2 min Durchquerung, natürliche Häufung, Bodendetails, Flüsse/Pfade, weiche Übergänge.
- 2026-10-31 – **Zusätzlicher Meilenstein 20 „Fog of War“** (Nutzerwunsch: erkunden statt alles sehen).
- 2026-10-31 – **Zusätzlicher Meilenstein 21 „Kampf-Arena & Module“** (Nutzerwunsch: isoliert und mit mehreren Agenten am Kampf arbeiten), siehe `docs/modules/README.md`.
- 2026-10-31 – **Zusätzlicher Meilenstein 22 „Zoombare Weltkarte“** (Nutzerwunsch; nötig durch große Welt + Fog of War).
- 2026-10-31 – **Zusätzlicher Meilenstein 23 „Aussehen aus Ausrüstung“** (Nutzerwunsch: Kleidung aus Ausrüstung statt Farbwahl, Völker mit Merkmalen).
- 2026-10-31 – **Zusätzlicher Meilenstein 24 „Höhen, Klippen und Sicht“** (Nutzerwunsch, `docs/VORSCHLAG-hoehen.md`): Hänge, Klippen im Gebirge, Hügelland, Seen in Senken, Sicht nach Sichtlinie.
- 2026-10-31 – **Zusätzlicher Meilenstein 25 „Arena-Werkzeuge“** (Nutzerwunsch): Gelände-Aufbauten, Waffenwahl, Gegner gezielt einsetzen in der Kampf-Arena.
- 2026-10-31 – **Zusätzlicher Meilenstein 26 „Saubere Höhenkanten“** (Nutzerfeedback): kein Dekor auf Kanten, deutliche Abbruchkanten.
- 2026-10-31 – **Zusätzlicher Meilenstein 27 „Fester Sichtausschnitt“** (Nutzerwunsch): Fenster, Auflösung und Zoom bringen keinen Sichtvorteil.
- 2026-11-01 – **Zusätzlicher Meilenstein 28 „Kampf in 8 Richtungen“** (Nutzerwunsch): Zielen und Schlagen diagonal.
- 2026-11-01 – **Zusätzlicher Meilenstein 29 „Spielleiter-Modus“** (Nutzerwunsch): fliegen, Teleport über die Karte.
- 2026-11-01 – **Zusätzliche Meilensteine 30 „Oberweite-Regler“ und 31 „Blocken & Ausweichen“** (Nutzerwünsche); dazu Prototyp „schräge Perspektive“ auf eigenem Branch `prototyp/perspektive` (nicht auf main).

## Mehrere Agenten

Weiterentwicklung mit einem **Koordinator** und Modul-Sessions: `docs/modules/KOORDINATION.md` (Skill
`/koordinieren`). Module und ihre Anleitungen: `docs/modules/README.md` (Skills `/modul <name> …`, `/kampf …`).
Eine neue Session, die koordinieren soll, liest zuerst diese beiden Dateien.

## Vorgehen

1. Hole Dir alles, was Du voraussichtlich von mir brauchst, zu Beginn einer Session.
2. Nutze GitHub & GitHub Pages.
3. Nutze für die technischen Meilensteine so lange es geht eine rein lokale Datenhaltung (bspw. Browser Cache).
4. Du hast den Auftrag, Pakete, Erweiterungen usw., die Du für die Entwicklung benötigst, eigenständig zu installieren.
5. Nutze ein explizites Terminal, in dem ich Dir sudo Rechte gebe, falls Du sie benötigst
6. Du hast den Auftrag, alle aufkommenden Fragen / Annahmen selber zu beantworten / zu treffen. Dokumentiere sie hier.
7. Entscheide stets im Sinne der Wünsche an das Spiel. Die Wünsche an das Spiel darfst Du nicht anpassen.
8. Schreibe vor der Entwicklung eines jeden nächsten Meilensteins zunächst am Design Dokument und den Anforderungen. Arbeite diese dann ab, bis Du den Meilenstein erreicht hast. Wiederhole dieses Vorgehen dann für den nächsten Meilenstein.
9. Nutze hilfreiche Akzeptanz- & Unit Tests. Halte sie in einem effektiven & effizienten Gleichgewicht zwischen Veränderbarkeit des Produktes und Sicherheit vor Seiteneffekten.

## Entscheidungen & Annahmen

Format: Datum – Entscheidung (Begründung).

### Organisatorisch
- 2026-10-30 – Commits als `alexanderdelp` mit GitHub-noreply-Adresse, direkt auf `main` (mit Nutzer abgestimmt; ein Entwickler, keine Reviews nötig).
- 2026-10-30 – Spielsprache Deutsch, Texte so gehalten, dass Übersetzung nachrüstbar ist (mit Nutzer abgestimmt).
- 2026-10-30 – Nach jedem Meilenstein Kurz-Update an den Nutzer (Link, 1–4 Screenshots, 3 Punkte) (Nutzerwunsch).
- 2026-10-30 – Arbeitstitel „Game01“; ein Name entsteht mit dem World Building (M8). → 2026-10-31: Name **„Splitterwelten“** (Repo bleibt `game01`).
- 2026-10-30 – Code unter MIT-Lizenz; externe Assets behalten ihre Lizenz und stehen in `CREDITS.md`.
- 2026-10-30 – Dokumentation: `docs/DESIGN.md` (Gesamtdesign) und `docs/milestones/Mxx-*.md` (Anforderungen + Ergebnis je Meilenstein).

### Technik
- 2026-10-30 – Phaser 3.87, TypeScript 5.7, Vite 6, Vitest 2, Playwright 1.49 (Versionen fest, stabil und bekannt).
- 2026-10-30 – Weltlogik (`src/world`) ohne Phaser-Abhängigkeit → mit Unit-Tests ohne Browser prüfbar.
- 2026-10-30 – CI (GitHub Actions) führt Unit- und Akzeptanztests aus und deployt nur bei Erfolg auf GitHub Pages.
- 2026-10-30 – Chunk-Generierung in Web Workern (ein Chunk braucht ~50 ms; im Haupt-Thread würde das ruckeln).

### Welt
- 2026-10-30 – Endliche Welt mit 4096 × 4096 Kacheln (16 px), Chunks à 32 × 32. Ein großer Kontinent mit Inseln, ozeanumrandet (Elite-artig: alles ist Funktion des Seeds; „weit“, aber mit klaren Grenzen für eine Weltkarte und spätere Reiche).
- 2026-10-30 – Norden kalt, Süden heiß; Höhe kühlt zusätzlich. Gebirge als Gratketten.
- 2026-10-30 – Zwei Sonderbiome als Genre-Brücke: **Kristallhain** (Magie) und **Schrottödnis** (Cyberpunk-Relikte). Weitere Fantasy/Cyberpunk-Inhalte (Städte, Ruinen, Reiche) folgen mit M8.
- 2026-10-30 – Landschaftsgrafik prozedural im Code statt LPC-Terrain (LPC-Terrain braucht aufwendiges Autotiling für Übergänge; im Code erzeugt bekommt jedes Biom eigene Optik und organische Grenzen, ohne Lizenzfragen). LPC bleibt für Figuren (ab M2) gesetzt.
- 2026-10-30 – Seed als Text (`?seed=...`), ohne Seed wird ein lesbarer Zufalls-Seed erzeugt und in die URL geschrieben (teilbar).

- 2026-10-30 – (M2) Welt auf **32-px-Kacheln** umgestellt (LPC-Maßstab), Chunks 16 × 16 Kacheln. Bäume & Co. werden prozedural im LPC-Maßstab erzeugt.
- 2026-10-30 – (M2) Figuren aus LPC-Ebenen (Universal LPC Spritesheet Generator, GitHub) mit Laufzeit-Umfärbung über die LPC-Paletten; Import per `tools/import_lpc.py`.
- 2026-10-30 – (M2) Spielerposition wird pro Seed im `localStorage` gespeichert (casual: jederzeit aufhören). Volle Persistenz folgt in M9.
- 2026-10-30 – (M2) Touch-Steuerung (Ziehen = Stick, Buttons), weil der Nutzer Zwischenstände auch am Handy anschaut.
- 2026-10-30 – (M3) NPCs sind seed-basiert pro Chunk „zu Hause“ (Rolle passend zum Biom, Name aus Silben, eines von 16 Aussehen-Archetypen je Welt). Sie existieren vorerst nur, solange ihr Chunk geladen ist; dauerhafte Simulation folgt in M10.
- 2026-10-30 – (M3) Dialoge sind vorerst feste Sätze je Rolle (Deutsch); Quests (M7) und seed-basierte Geschichten (M8) bauen darauf auf.
- 2026-10-30 – (M4) Steuerung: Leertaste/J = Angriff, E = Reden (Touch: ⚔-Button, „Reden“). Tod ohne Strafe, Erwachen am Startpunkt (casual).
- 2026-10-30 – (M4) Gegnerstufe = 1 + Entfernung vom Start / 150 Kacheln → die Welt wird nach außen gefährlicher (Anreiz zur Erkundung und Progression in M5).
- 2026-10-30 – (M4) Gegner im Genre-Mix: Schleime & Irrlichter (Fantasy), Drohnen (Cyberpunk), Räuber (LPC). Kreaturen prozedural animiert.
- 2026-10-30 – (M5) Währung „Splitter“ (Kristallsplitter: Energie für Magie und Maschinen – verbindet beide Genres). Wird ab M7 für Händler/Quests genutzt.
- 2026-10-30 – (M5) Heldenfortschritt (Stufe, Talente, Inventar) wird schon jetzt pro Welt lokal gespeichert, weil Verlust beim Neuladen dem Wunsch „casual“ widerspräche. Weltzustand bleibt M9.
- 2026-10-30 – (M6) Völker: Mensch (+10 % EP), Elf (+8 % Tempo), Ork (+20 LP), Synth (+3 Vert., Cyberpunk). Kleine Boni, damit die Wahl zählt, aber nichts falsch gemacht werden kann.
- 2026-10-30 – (M6) Erschaffung beim ersten Betreten einer Welt; Aussehen jederzeit über das Heldenfenster änderbar (casual).
- 2026-10-30 – (M7) Quests seed-basiert pro NPC (Reihe mit Index), 4 Arten (Jagd, Sammeln, Botengang, Erkundung), max. 5 aktiv, jederzeit abbrechbar. Ziele werden mit Himmelsrichtung beschrieben und per Pfeil angezeigt – fördert Erkundung der großen Welt.
- 2026-10-31 – (M8) Jede Welt hat einen Namen, 6 Reiche mit Fraktionen (Magierzirkel, Technokratie, Klan, Freie Händler, Orden des Lichts), ~20 Siedlungen (sichere Orte ohne Gegner) und eine Chronik in 8 Fragmenten an Obelisken. Die Fraktion bestimmt den Baustil (Fachwerk ↔ Neon).
- 2026-10-31 – (M8) Geheimnisse: Truhen (5 % der Chunks), Schreine (2 %, Heilung + Angriffs-Segen).
- 2026-10-31 – (M9) Trennung **Weltzustand** (Ereignisprotokoll, gehört allen) ↔ **Held** (gehört dem Spieler). Persistente Folgen: Truhen, Kills (20 min), Entdeckungen/Wegsteine, Wohlstand der Orte (sichtbar bis zur Heldenstatue), Ansehen je Reich (Rabatt, Titel).
- 2026-10-31 – (M9) Schnellreise zwischen entdeckten Orten (große Welt + casual).
- 2026-10-31 – (M10) Lebendige Welt als **reine Funktion von Seed + echter Uhrzeit** (statt Tick-für-Tick-Nachrechnen, wie ursprünglich angenommen): kein Server nötig, keine Wartezeit nach langer Pause, und alle Spieler sehen dieselbe Welt (Basis für M11). 1 Spieltag = 24 min, 1 Simulationsschritt = 1 h. Spielerhandlungen (M9) fließen als Einfluss ein.
- 2026-10-31 – (M11) Geteilte Welt in zwei Stufen, weil ein Online-Server ein Konto des Nutzers braucht: (1) **Teilen per Link/Datei** ohne Server (Ereignisprotokoll komprimiert im URL-Anker, Zusammenführen konfliktfrei), (2) optionaler **Sync-Server** (`server/sync-server.mjs`, ohne Abhängigkeiten) über `?sync=<URL>`. Keine Fremddienste ohne Zustimmung des Nutzers.
- 2026-10-31 – (M12) Live-Zusammenspiel über den Referenz-Server (Server-Sent Events + POST), „Lite-Koop“: Präsenz, gemeinsame Treffer (Gegner sind seed-gleich), Gruppenerfahrung, Chat. WebRTC ohne Server wäre möglich, bräuchte aber einen STUN-Dienst eines Dritten → nicht ohne Zustimmung eingebaut.
- 2026-10-31 – (M13) Musik und Klänge prozedural per Web Audio (keine Audiodateien/Lizenzen), abschaltbar im Menü.
- 2026-10-31 – Testmodus `?test=1` (feste Weltzeit Mittag, keine Invasionen): Die Simulation hängt an der echten Uhrzeit, automatische Tests müssen aber reproduzierbar sein (eine echte Drohnen-Invasion ließ einen Kampftest scheitern).
- 2026-10-31 – Telegram-Bot für Updates **und Fragen** an den Nutzer (`tools/telegram.mjs`); der Nutzer ist nur vereinzelt im Chat, Telegram bleibt der Hauptkanal (Nutzerentscheidung). Token und Chat-ID liegen außerhalb des Repos in `~/.config/game01/telegram.env` (nie committen).
- 2026-10-31 – (M18) Synth trägt keine Kleidung, sondern Implantate/Panzerung; Aussehen nach der Erschaffung nur beim Barbier (Splitter), Volk/Körper fest (Nutzerentscheidung).
- 2026-10-31 – (M24) Zwei Arten Höhe: stufenloser **Hang** (immer begehbar, steil = bis −35 % Tempo) und ganzzahlige **Stufen** nur im **Gebirge** (Klippe = nicht begehbar, Felswand 32 px je Stufe, auf Pfaden Treppe). **Hügelland** als eigenes Biom (Nutzerentscheidung: Gebirge zerklüftet, Hügelland sanft). Seen in Senken des Flachlands. Weltversion 3, alte Spielstände werden nicht übernommen (Nutzerentscheidung: Tech-Demo).
- 2026-10-31 – (M24) Sicht über Höhen (Nutzerentscheidung: alle drei Stufen): verdecktes Gelände abgedunkelt, Gegner/NPCs dort unsichtbar, Fog of War nur nach Sichtlinie; Sichtweite 20 Kacheln, von oben bis 50. Flachland nur leicht gewellt, damit die Sicht dort frei bleibt.
- 2026-10-31 – (M23) Aussehen aus Ausrüstung: Kleidung als sichtbare Einzelteile mit Boni, Editor ohne Kleidungsfarben, Synth ohne Geschlecht, Volksmerkmale (Nutzerentscheidung).
- 2026-10-31 – (M19) Ziel: ein Biom in 1–2 min durchqueren (Nutzerentscheidung).
- 2026-10-31 – (M19) Welt 8192 × 8192 Kacheln, Flüsse mit Brücken an Pfaden; Weltversion 2 (alte Positionen verfallen). Vom Nutzer freigegeben.
- 2026-10-31 – (M20) Fog of War pro Spieler (nicht im geteilten Weltzustand; Nutzerentscheidung: jeder Spieler hat seinen eigenen), Zellen à 16 Kacheln, Sichtweite 20 Kacheln.
- 2026-10-31 – (M21) Kampf-Arena nur für PC (Tastatur), keine Handysteuerung nötig (Nutzerentscheidung).
- 2026-10-31 – Vorbereitung Mehr-Agenten-Arbeit: `WorldScene` in Teile zerlegt (`src/scenes/world/`: Sicht, Gespräche, Netz, Test-Schnittstelle), `UIScene` ohne Weltkarte (`src/ui/WorldMap.ts`) und Heldenfenster (`src/ui/HeroPanel.ts`); Anleitungen für alle Module, Skills `/modul` und `/koordinieren`, Knotenpunkte gehören dem Koordinator (Nutzerwunsch: Koordinator + parallele Sessions).
- 2026-10-31 – (M25) Bisher gibt es nur den Waffentyp Dolch. Neue Waffentypen erst später, vorerst nur Waffenwahl in der Arena (Nutzerentscheidung). Gegner am Boden planen Umwege um Hindernisse (gilt auch in der Welt); Gegner werden von Sumpf/Hängen nicht gebremst.
- 2026-10-31 – (M26) Dekor hält Abstand zu Höhenkanten statt teilweiser Verdeckung durch die Klippe (einfacher, Kanten bleiben lesbar); im zerklüfteten Gebirge Dekor dafür ×1,5 dichter. `WORLD_VERSION` bleibt 3.
- 2026-10-31 – (M27) Sichtbarer Weltausschnitt höchstens 32 × 18 Kacheln (lange × kurze Seite), ganzzahliger Mindest-Zoom statt Rand (Pixel-Art bleibt scharf); außerhalb des Sichtrasters gilt alles als verdeckt. Arena ausgenommen.
- 2026-11-01 – (M28) LPC hat nur 4 Blickrichtungen: Zielen/Schlagen/Blitz in 8 Richtungen (`aim`), Sprite diagonal in Seitenansicht, Schwung-Bogen macht die Diagonale sichtbar.
- 2026-11-01 – Tests aufgeräumt (Nutzerwunsch): Logik per Unit, E2E je Modul ein schlanker Ablauf, Polling statt fester Wartezeiten, parallel (4 Worker lokal, 2 in CI), Testfenster 960 × 540; E2E von ~9 auf ~4 min. Grundsätze und Abdeckung je Anforderung: `docs/TESTS.md`.
- 2026-11-01 – (M29) Spielleiter-Modus nur mit `?gm=1` (F2 / Menü): fliegen ohne Kollision, unverwundbar, Karte ohne Nebel mit Klick-Teleport; hinterlässt keine Spuren (kein Fog, keine Entdeckungen, Position nicht gespeichert).
- 2026-11-01 – (M30) Oberweite als Regler (4 Stufen) nur für Mensch + weiblich, prozedurale Verformung von Körper und Oberteilen; nach der Erschaffung fest wie Volk/Körper.
- 2026-11-01 – (M31) Blocken (L halten, Parieren kurz vor dem Treffer) und Ausweichen (Leertaste) vorerst nur in der Arena; ins Spiel nach Freigabe des Nutzers.
- 2026-10-31 – (M21) Kampf über `CombatTerrain` entkoppelt; Kampf-Arena `?arena=1`; Module mit eigener Anleitung, `CLAUDE.md` im Ordner und Skill (`/kampf`); parallele Agenten in eigenen Git-Worktrees, Integration auf `main` durch einen Integrator.

### Offene Aufgaben (mit dem Nutzer zu klären)
- **Klassen und Skilltrees:** Klassen, die Dinge vorgeben – Skilltrees, die Dinge vorgeben – oder Skilltrees, aus denen Klassen folgen? Nutzer will hier später tiefer rein. Siehe `docs/VORSCHLAG-aussehen-voelker.md`.
- **Ideen für später** (vom Nutzer als Idee vorgemerkt): Spielweise je Volk, Reaktionen der Fraktionen auf Völker, Rüstungsgrenzen je Volk, Umfärben beim Schneider.

### Ausblick (Annahmen für spätere Meilensteine)
- Dauerhaft automatisch geteilte Welt und Live-Multiplayer (M12) brauchen einen öffentlich erreichbaren Server mit HTTPS. Den muss der Nutzer bereitstellen (Konto bei einem Hoster); der Referenz-Server liegt bereit.

