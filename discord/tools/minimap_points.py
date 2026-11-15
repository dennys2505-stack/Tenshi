# Repère si une image envoyée sur Discord est une mini map (avec un point blanc = départ, une croix = arrivée).
# Usage : python3 minimap_points.py <image> <minimap_du_site.png>
# Sortie JSON : {"minimap": bool, "score": float, "from": [x,y] | null, "to": [x,y] | null}  (fractions 0-1 de la mini map du site)
import sys, json, numpy as np
from PIL import Image
from scipy.signal import fftconvolve
from scipy import ndimage

def gray_mask(a, lo=105, hi=205, sat=22):
    v = a.mean(2); s = a.max(2) - a.min(2)
    return (v > lo) & (v < hi) & (s < sat)

def main(img_path, ref_path):
    base = Image.open(img_path).convert('RGB')
    best_out = None
    # La capture peut être tournée par rapport à la mini map du site : on essaie les 4 sens.
    for rot in (0, 90, 180, 270):
        o = analyze(base.rotate(rot, expand=True), ref_path)
        if best_out is None or o['score'] > best_out['score']: best_out = o
    print(json.dumps(best_out))

def analyze(im, ref_path):
    # travail à taille réduite pour aller vite
    k = 700 / max(im.size); im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
    a = np.asarray(im).astype(float)
    r = np.asarray(Image.open(ref_path).convert('RGBA')).astype(float)
    rm = ((r[..., 3] > 0) & (np.abs(r[..., :3].mean(2) - 128) < 25) & ((r[..., :3].max(2) - r[..., :3].min(2)) < 12)).astype(float)
    RH, RW = rm.shape
    best = (-1, 1, 0, 0)
    for s in np.arange(0.5, 1.6, 0.01):
        w, h = int(im.width * s), int(im.height * s)
        if w < 50 or h < 50: continue
        cm = gray_mask(np.asarray(im.resize((w, h))).astype(float)).astype(float) * 2 - 1
        pad = np.zeros((RH + 2 * h, RW + 2 * w)); pad[h:h + RH, w:w + RW] = rm
        sc = fftconvolve(pad, cm[::-1, ::-1], mode='valid')
        i = np.unravel_index(sc.argmax(), sc.shape)
        val = sc[i] / max(1, (cm > 0).sum())
        if val > best[0]: best = (val, s, i[1] - w, i[0] - h)
    score, s, tx, ty = best
    out = {'minimap': bool(score > 0.6), 'score': round(float(score), 3), 'from': None, 'to': None}
    if out['minimap']:
        v = a.mean(2); sat = a.max(2) - a.min(2)
        white = (v > 225) & (sat < 30)
        lab, n = ndimage.label(white)
        blobs = []
        for j in range(1, n + 1):
            ys, xs = np.nonzero(lab == j)
            if len(xs) < 12: continue
            bw, bh = np.ptp(xs) + 1, np.ptp(ys) + 1
            if max(bw, bh) > 0.12 * max(im.size): continue  # trop grand : texte, cadre
            fill = len(xs) / (bw * bh)
            cx, cy = xs.mean(), ys.mean()
            fx, fy = (cx * s + tx) / RW, (cy * s + ty) / RH
            if not (0 <= fx <= 1 and 0 <= fy <= 1): continue
            blobs.append((fill, len(xs), [round(fx, 3), round(fy, 3)], abs(bw - bh) / max(bw, bh)))
        # Point plein : on efface les traits fins (contours, croix) puis on cherche une tache ronde.
        dots = []
        op = ndimage.binary_opening(white, structure=np.ones((5, 5)))
        lab2, n2 = ndimage.label(op)
        for j in range(1, n2 + 1):
            ys, xs = np.nonzero(lab2 == j)
            bw, bh = np.ptp(xs) + 1, np.ptp(ys) + 1
            if len(xs) < 15 or max(bw, bh) > 0.06 * max(im.size) or abs(bw - bh) / max(bw, bh) > 0.35: continue
            fx, fy = (xs.mean() * s + tx) / RW, (ys.mean() * s + ty) / RH
            if 0 <= fx <= 1 and 0 <= fy <= 1: dots.append((len(xs) / (bw * bh), len(xs), [round(fx, 3), round(fy, 3)]))
        dots.sort(key=lambda b: -b[1])
        crosses = sorted([b for b in blobs if b[0] < 0.5 and b[3] < 0.35], key=lambda b: -b[1])
        if dots: out['from'] = dots[0][2]
        if crosses: out['to'] = crosses[0][2]
    return out

main(sys.argv[1], sys.argv[2])
