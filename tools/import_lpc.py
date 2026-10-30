"""Kopiert ausgewählte LPC-Sprites aus einem lokalen Klon des Universal-LPC-Generators nach public/assets/lpc
und schreibt die zugehörigen Credits. Aufruf: python3 -I tools/import_lpc.py <pfad-zum-ulpc-klon>"""
import csv, json, os, shutil, sys

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, 'public', 'assets', 'lpc')
PARTS = json.load(open(os.path.join(ROOT, 'tools', 'lpc-parts.json')))

copied = []
for d in PARTS['dirs']:
    for a in PARTS['animations']:
        rel = f'{d}/{a}.png'
        src = os.path.join(SRC, 'spritesheets', rel)
        if not os.path.exists(src):
            continue
        os.makedirs(os.path.dirname(os.path.join(DST, rel)), exist_ok=True)
        shutil.copyfile(src, os.path.join(DST, rel))
        copied.append(rel)

for f in PARTS.get('files', []):
    src = os.path.join(SRC, 'spritesheets', f['src'])
    dst = os.path.join(DST, f['dst'])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    copied.append(f.get('credit', f['src']))

pal = {}
for mat in ('body', 'hair', 'cloth'):
    pal[mat] = json.load(open(os.path.join(SRC, 'palette_definitions', mat, f'{mat}_ulpc.json')))
json.dump(pal, open(os.path.join(DST, 'palettes.json'), 'w'), indent=1)

rows = [r for r in csv.DictReader(open(os.path.join(SRC, 'CREDITS.csv'), encoding='utf-8')) if r['filename'].strip() in set(copied)]
with open(os.path.join(DST, 'CREDITS-LPC.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['filename', 'notes', 'authors', 'licenses', 'urls'])
    w.writeheader()
    for r in rows:
        w.writerow({k: (r[k] or '').strip() for k in w.fieldnames})
print(f'{len(copied)} Dateien kopiert, {len(rows)} Credit-Zeilen')
