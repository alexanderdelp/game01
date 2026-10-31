# Szenen (Knotenpunkt)

`WorldScene.ts` verbindet alle Module und gehört dem **Koordinator** (`docs/modules/KOORDINATION.md`).
Module arbeiten in ihren Teilen: `world/WorldSight.ts` (Welt), `world/WorldTalk.ts` (Inhalte), `world/WorldNet.ts` (Netz),
`world/worldDebug.ts` (Test-Schnittstelle, nur additiv), `UIScene.ts` (Oberfläche), `CreateScene.ts` (Figur).
Braucht ein Modul eine Änderung an `WorldScene.ts`, beschreibt es sie in der Übergabe.
