"""Kopiert ausgewählte LPC-Sprites aus einem lokalen Klon des Universal-LPC-Generators nach public/assets/lpc
und schreibt die zugehörigen Credits. Aufruf: python3 -I tools/import_lpc.py <pfad-zum-ulpc-klon>"""
import csv, json, os, struct, sys

# Farbraum-Angaben entfernen: Browser mit Farbmanagement rechnen sonst die Pixel um, und die exakte
# Paletten-Umfärbung im Spiel findet ihre Farben nicht mehr (Feedback-Runde 1, Punkt 5).
COLOR_CHUNKS = {b'sRGB', b'gAMA', b'cHRM', b'iCCP'}


def copy_png(src, dst):
    data = open(src, 'rb').read()
    out, i = [data[:8]], 8
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        if data[i + 4:i + 8] not in COLOR_CHUNKS:
            out.append(data[i:i + 12 + n])
        i += 12 + n
    open(dst, 'wb').write(b''.join(out))

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, 'public', 'assets', 'lpc')
PARTS = json.load(open(os.path.join(ROOT, 'tools', 'lpc-parts.json')))

copied = []
for d in PARTS['dirs']:
    for a in PARTS['animations']:
        rel = f'{d}/{a}.png'
        # Manche Teile liegen nur in Farbvarianten vor (<dir>/<anim>/<farbe>.png); die weiße dient als Basis.
        var = PARTS.get('variants', {}).get(d)
        src = os.path.join(SRC, 'spritesheets', f'{d}/{a}/{var}.png' if var else rel)
        if not os.path.exists(src):
            continue
        os.makedirs(os.path.dirname(os.path.join(DST, rel)), exist_ok=True)
        copy_png(src, os.path.join(DST, rel))
        copied.append(rel)

for f in PARTS.get('files', []):
    src = os.path.join(SRC, 'spritesheets', f['src'])
    dst = os.path.join(DST, f['dst'])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    copy_png(src, dst)
    copied.append(f.get('credit', f['src']))

pal = {}
for mat in ('body', 'hair', 'cloth', 'metal'):
    pal[mat] = json.load(open(os.path.join(SRC, 'palette_definitions', mat, f'{mat}_ulpc.json')))
json.dump(pal, open(os.path.join(DST, 'palettes.json'), 'w'), indent=1)

allrows = {r['filename'].strip(): r for r in csv.DictReader(open(os.path.join(SRC, 'CREDITS.csv'), encoding='utf-8'))}
rows = []
for c in copied:
    r = allrows.get(c)
    if r is None and c.endswith('.png'):
        # Upstream fehlt manchmal eine Animation in den Credits: gleiche Urheber wie die Geh-Animation desselben Teils.
        walk = allrows.get(os.path.dirname(c) + '/walk.png')
        r = walk and {**walk, 'filename': c}
    if r is not None:
        rows.append(r)
with open(os.path.join(DST, 'CREDITS-LPC.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['filename', 'notes', 'authors', 'licenses', 'urls'])
    w.writeheader()
    for r in rows:
        w.writerow({k: (r[k] or '').strip() for k in w.fieldnames})
print(f'{len(copied)} Dateien kopiert, {len(rows)} Credit-Zeilen')
