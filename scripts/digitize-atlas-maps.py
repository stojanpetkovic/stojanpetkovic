#!/usr/bin/env python3
"""
Digitise the temperature maps of the Geothermal Atlas of Vojvodina (2010) into
`src/lib/geothermal/atlas-data.ts`.

The atlas (https://www.psegs.vojvodina.gov.rs/wp-content/uploads/2013/03/Geotermalni_atlas_AP_Vojvodine.pdf)
holds each map as one raster picture. Maps 5, 6 and 7 (PDF pages 12, 13 and 14 of the
English edition) show the temperature at 500, 1,000 and 2,000 m in colour classes, with
a legend and a Gauss-Krueger frame (easting 7320 to 7545 km, northing 4940 to 5120 km).

    pdfimages -f 12 -l 14 -png Geothermal_atlas_of_AP_Vojvodina.pdf maps/nat
    python3 scripts/digitize-atlas-maps.py maps

`maps/` must hold nat-000.png, nat-001.png and nat-002.png (the three pictures, in
page order). The script is written for these pictures: the pixel positions of the axes
and legends below were read from them.

How it works: each pixel takes the legend class whose colour is nearest, pixels that
match no class (lines, labels, markers, rivers) are filled from their neighbours, and
the picture is sampled on a 2 km grid by the median of the pixels in each cell. The
outline of the province comes from the 2,000 m map, whose lowest class is not white.
Needs numpy, scipy and Pillow.
"""
import base64
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

IMG_DIR = sys.argv[1] if len(sys.argv) > 1 else 'maps'
OUT = 'src/lib/geothermal/atlas-data.ts'

# image -> (axis x px for 7320, axis y px for 4940)
CAL = {'nat-000': (254.5, 1052.3), 'nat-001': (255.0, 1052.3), 'nat-002': (255.0, 1052.8)}
SX, SY = 5.39, 5.375   # px per km
# legend: (bar x centre, top edge y, bottom edge y, lowest label, step, number of boxes)
LEG = {
  'nat-000': (305, 749.0, 1022.7, 34.0, 0.5, 21),
  'nat-001': (304, 627.0, 982.0, 57.0, 1.0, 18),
  'nat-002': (296, 692.0, 1007.0, 94.0, 2.0, 15),
}
E0, E1, N0, N1, CELL = 7320, 7546, 4940, 5120, 2.0
NX = int((E1 - E0) / CELL); NY = int((N1 - N0) / CELL)

def run(name, depth):
    im = np.array(Image.open(f'{IMG_DIR}/{name}.png').convert('RGB')).astype(float)
    H, W, _ = im.shape
    x0, y0 = CAL[name]
    bx, top, bot, lo, step, nb = LEG[name]
    bh = (bot - top) / nb
    pal = []; vals = []
    for k in range(nb):               # k=0 is the top box
        yc = top + (k + 0.5) * bh
        patch = im[int(yc) - 2:int(yc) + 3, int(bx) - 4:int(bx) + 5].reshape(-1, 3)
        pal.append(np.median(patch, axis=0))
        # box k from the top: top box is >= highest label, the rest sit between labels
        vals.append(lo + (nb - 1 - k) * step + step / 2)
    pal = np.array(pal)[1:]; vals = np.array(vals)[1:]   # the top box is never reached by the data
    # plot rectangle in px
    xl, xr = int(x0 + 2), int(x0 + (E1 - E0) * SX)
    yt, yb = int(y0 - (N1 - N0) * SY), int(y0 - 2)
    sub = im[yt:yb, xl:xr]
    # nearest palette colour per pixel
    d = np.linalg.norm(sub[:, :, None, :] - pal[None, None, :, :], axis=3)
    idx = d.argmin(axis=2); dist = d.min(axis=2)
    valid = dist < 22
    # outside: near-white connected to the plot corners
    white = (sub.min(axis=2) >= 250)
    lab, n = ndi.label(white)
    outside = np.zeros_like(white)
    for sy_, sx_ in [(sub.shape[0] - 4, 4), (4, sub.shape[1] - 4), (4, 4), (sub.shape[0] - 4, sub.shape[1] - 4)]:
        if lab[sy_, sx_]:
            outside |= lab == lab[sy_, sx_]
    base = valid & ~outside
    closed = ndi.binary_closing(base, structure=np.ones((9, 9)))
    lab2, n2 = ndi.label(closed)
    prov = np.zeros_like(base)
    for k in range(1, n2 + 1):
        m = lab2 == k
        if m.sum() < 3000: continue
        ys, xs = np.nonzero(m)
        if xs.mean() + xl < 340 and ys.mean() + yt > 560: continue   # the legend bar
        prov |= m
    val = np.where(base & prov, vals[idx], np.nan)
    # per-cell median
    grid = np.full((NY, NX), np.nan); inside = np.zeros((NY, NX), bool)
    for j in range(NY):
        Nc = N0 + (j + 0.5) * CELL
        yc = y0 - (Nc - N0) * SY - yt
        for i in range(NX):
            Ec = E0 + (i + 0.5) * CELL
            xc = x0 + (Ec - E0) * SX - xl
            ya, yb2 = int(yc - CELL * SY / 2), int(yc + CELL * SY / 2) + 1
            xa, xb = int(xc - CELL * SX / 2), int(xc + CELL * SX / 2) + 1
            if ya < 0 or xa < 0 or yb2 > sub.shape[0] or xb > sub.shape[1]: continue
            blockO = ~prov[ya:yb2, xa:xb]
            if blockO.mean() > 0.5: continue
            inside[j, i] = True
            v = val[ya:yb2, xa:xb]; v = v[~np.isnan(v)]
            if v.size >= 0.25 * blockO.size: grid[j, i] = np.median(v)
    # fill the holes inside the province from the nearest valid cell
    hole = inside & np.isnan(grid)
    if hole.any():
        ii = ndi.distance_transform_edt(np.isnan(grid), return_distances=False, return_indices=True)
        grid = np.where(hole, grid[ii[0], ii[1]], grid)
    med = ndi.generic_filter(grid, np.nanmedian, size=3, mode='nearest')
    grid = np.where(inside, med, np.nan)
    print(name, depth, 'inside cells', int(inside.sum()), 'holes filled', int(hole.sum()),
          'min/max', np.nanmin(grid), np.nanmax(grid), 'mean', round(float(np.nanmean(grid)), 2))
    return grid, inside, pal, vals



HEADER = '/**\n * Temperature maps of the Geothermal Atlas of Vojvodina (2010), Maps 5, 6 and 7:\n * the temperature at 500, 1,000 and 2,000 m, digitised from the colour classes of\n * the published maps (Prilog: Geotermalni atlas Vojvodine, Pokrajinski sekretarijat\n * za energetiku, građevinarstvo i saobraćaj).\n *\n * Each map is a grid in Gauss–Krüger zone 7 (MGI, kilometres): columns start at\n * easting 7320 and rows at northing 4940, with 2 km cells, 113 columns by 90 rows,\n * rows running from south to north. A byte is a class midpoint: byte 0 is outside\n * the province, any other byte b is `min + (b - 1) * step` degrees Celsius.\n * The resolution is that of the colour classes (0.5, 1 and 2 degrees).\n *\n * Generated by `scripts/digitize-atlas-maps.py`; do not edit by hand.\n */\n\nexport interface AtlasLayer {\n  /** Depth of the map, metres. */\n  depthM: number;\n  /** Temperature of byte 1, °C. */\n  min: number;\n  /** Degrees per byte step. */\n  step: number;\n  /** Base64 of 113 × 90 bytes, row by row from the south. */\n  data: string;\n}\n\nexport const ATLAS_GRID = { e0: 7320, n0: 4940, cell: 2, nx: 113, ny: 90 } as const;\n\nexport const ATLAS_LAYERS: AtlasLayer[] = [\n'

raw = {}
for name, depth in (('nat-002', 2000), ('nat-000', 500), ('nat-001', 1000)):
    raw[depth] = run(name, depth)

# the province outline is cleanest on the 2,000 m map
mask = ndi.binary_closing(raw[2000][1], structure=np.ones((3, 3)))
mask = ndi.binary_fill_holes(mask)
lab, n = ndi.label(mask)
sizes = ndi.sum(mask, lab, range(1, n + 1))
keep = np.zeros_like(mask)
for k, size in enumerate(sizes, start=1):
    if size >= 150:
        keep |= lab == k
mask = keep

layers = []
for depth in (500, 1000, 2000):
    g = np.where(mask, raw[depth][0], np.nan)
    need = mask & np.isnan(g)
    if need.any():
        ii = ndi.distance_transform_edt(np.isnan(g), return_distances=False, return_indices=True)
        g = np.where(need, g[ii[0], ii[1]], g)
    g = np.where(mask, g, np.nan)
    values = g[~np.isnan(g)]
    lo = float(np.floor(values.min() * 4) / 4) - 0.25   # the value of byte 0
    step = 0.25
    data = np.zeros((NY, NX), np.uint8)
    m = ~np.isnan(g)
    data[m] = np.round((g[m] - lo) / step).astype(int)
    assert data[m].min() >= 1 and data[m].max() <= 255
    layers.append((depth, lo + step, step, base64.b64encode(data.tobytes()).decode()))
    print(depth, 'cells', int(m.sum()), 'min', values.min(), 'max', values.max(), 'mean', round(float(values.mean()), 2))

with open(OUT, 'w') as f:
    f.write(HEADER)
    for depth, mn, step, data in layers:
        f.write(f"  {{\n    depthM: {depth},\n    min: {mn},\n    step: {step},\n    data:\n      '{data}',\n  }},\n")
    f.write('];\n')
print('written', OUT)
