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
    # Recalage sur une petite image (rapide), lecture du point et de la croix sur une grande (traits fins).
    big = im.resize((max(1, int(im.width * 700 / max(im.size))), max(1, int(im.height * 700 / max(im.size)))))
    k = 360 / max(im.size); im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
    q = im.width / big.width
    a = np.asarray(big).astype(float)
    ref = Image.open(ref_path).convert('RGBA'); ref = ref.resize((ref.width // 2, ref.height // 2))
    r = np.asarray(ref).astype(float)
    rm = ((r[..., 3] > 0) & (np.abs(r[..., :3].mean(2) - 128) < 25) & ((r[..., :3].max(2) - r[..., :3].min(2)) < 12)).astype(float)
    RH, RW = rm.shape
    best = (-1, 1, 0, 0)
    for s in np.arange(0.4, 1.8, 0.02):
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
        s = s * q  # coordonnées lues sur la grande image
        # On efface tout ce qui est déjà blanc sur la mini map du site (contours, portes, cercles) :
        # il ne reste que ce que l'auteur a ajouté (point et croix).
        refw = np.asarray(Image.open(ref_path).convert('RGBA')).astype(float)
        FH, FW = refw.shape[:2]
        rw = ndimage.binary_dilation((refw[..., 3] > 0) & (refw[..., :3].min(2) > 200), iterations=2)
        ys0, xs0 = np.nonzero(white)
        fx0 = ((xs0 * s + tx) / RW * FW).astype(int); fy0 = ((ys0 * s + ty) / RH * FH).astype(int)
        inside = (fx0 >= 0) & (fx0 < FW) & (fy0 >= 0) & (fy0 < FH)
        drop = np.zeros(len(xs0), bool); drop[inside] = rw[fy0[inside], fx0[inside]]
        white[ys0[drop], xs0[drop]] = False
        lab, n = ndimage.label(white)
        blobs = []
        for j in range(1, n + 1):
            ys, xs = np.nonzero(lab == j)
            if len(xs) < 12: continue
            bw, bh = np.ptp(xs) + 1, np.ptp(ys) + 1
            if max(bw, bh) > 0.12 * max(big.size): continue  # trop grand : texte, cadre
            fill = len(xs) / (bw * bh)
            cx, cy = xs.mean(), ys.mean()
            fx, fy = (cx * s + tx) / RW, (cy * s + ty) / RH
            if not (0 <= fx <= 1 and 0 <= fy <= 1): continue
            # Forme de croix : un croisement plein au centre et des branches vers les 4 coins (×) ou les 4 côtés (+).
            M = np.zeros((bh, bw), bool); M[ys - ys.min(), xs - xs.min()] = True
            cy0, cx0 = bh // 2, bw // 2
            def hit(y, x, r=3): return M[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].any()
            q1, q3 = 0.2, 0.8
            corners = sum(hit(int(bh * a), int(bw * b)) for a in (q1, q3) for b in (q1, q3)) >= 3
            sides = sum(hit(int(bh * a), int(bw * b)) for a, b in ((0.1, 0.5), (0.9, 0.5), (0.5, 0.1), (0.5, 0.9))) >= 3
            crossy = hit(cy0, cx0, 2) and (corners or sides) and bw >= 7 and bh >= 7
            blobs.append((fill, len(xs), [round(fx, 3), round(fy, 3)], abs(bw - bh) / max(bw, bh), crossy))
        # Point plein : on efface les traits fins (contours, croix) puis on cherche une tache ronde.
        dots = []
        op = ndimage.binary_opening(white, structure=np.ones((5, 5)))
        lab2, n2 = ndimage.label(op)
        for j in range(1, n2 + 1):
            ys, xs = np.nonzero(lab2 == j)
            bw, bh = np.ptp(xs) + 1, np.ptp(ys) + 1
            if len(xs) < 15 or max(bw, bh) > 0.06 * max(big.size) or abs(bw - bh) / max(bw, bh) > 0.35: continue
            fx, fy = (xs.mean() * s + tx) / RW, (ys.mean() * s + ty) / RH
            if 0 <= fx <= 1 and 0 <= fy <= 1: dots.append((len(xs) / (bw * bh), len(xs), [round(fx, 3), round(fy, 3)]))
        dots.sort(key=lambda b: -b[1])
        crosses = sorted([b for b in blobs if b[4] and b[0] < 0.6 and b[3] < 0.35 and b[1] / b[0] <= 1000], key=lambda b: -b[1])
        if dots: out["from"] = dots[0][2]
        if crosses: out['to'] = crosses[0][2]
        # Une croix collée au point de départ = le point lui-même mal lu → on l'ignore.
        if out['from'] and out['to'] and abs(out['from'][0] - out['to'][0]) + abs(out['from'][1] - out['to'][1]) < 0.04: out['to'] = None
    return out

main(sys.argv[1], sys.argv[2])
