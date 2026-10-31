"""Generates the placeholder pixel-art assets into public/assets.

Run: python3 scripts/art/export.py   (needs Pillow + numpy)
Sprites are exported at 1x; the game scales them up with nearest-neighbour.
UI frames are exported at 3x for CSS border-image.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from sprites import *  # noqa
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets')
def out(a, rel, scale=1):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    im = Image.fromarray(a, 'RGBA')
    if scale != 1: im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(p)

out(space_bg(480, 300), 'sprites/space_bg.png')
out(sun(), 'sprites/sun.png')
out(foundry(), 'sprites/station_foundry.png')
out(junction(), 'sprites/station_junction.png')
out(gate(), 'sprites/station_gate.png')
out(ship, 'sprites/hauler.png')
for kind in ('iron', 'nickel', 'ice', 'sil'):
    for i, s in enumerate((22, 15, 11, 8, 6)):
        out(asteroid(s, kind, 100 + i * 7 + len(kind), 0.05), f'sprites/asteroid_{kind}_{i}.png')
out(floor_tile(), 'sprites/floor.png')
out(belt('down'), 'sprites/belt.png')
out(intake('iron'), 'sprites/intake.png')
out(smelter('g', 1.0), 'sprites/smelter.png')
out(assembler(False), 'sprites/assembler.png')
out(crate(), 'sprites/crate.png')
out(frame9('#241b14', '#6b5440', '#3d2f22', '#1f1812'), 'ui/panel.png', 3)
out(frame9('#241b14', '#ffb02e', '#ff7a2e', '#8f3a10', rivet='#ffe08a'), 'ui/panel_warn.png', 3)
out(btn9(None, '#ffcc33', '#b8860b', '#fff2a0'), 'ui/button.png', 3)
out(btn9(None, '#4d3b2a', '#1f1812', '#8a7058'), 'ui/button_alt.png', 3)
out(coin(), 'ui/coin.png', 3)
for n in ('map', 'factory', 'market', 'fleet'): out(icon(n), f'ui/icon_{n}.png', 3)
out(warn(), 'ui/icon_warn.png', 3)
for k in ('iron', 'nickel', 'ice', 'sil'): out(asteroid(9, k, 500, 0.06), f'ui/ore_{k}.png', 3)
print('assets written to', os.path.abspath(ROOT))
