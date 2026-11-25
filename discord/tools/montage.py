"""Montage d'une line up à partir d'une vidéo source et d'un plan (JSON).

Usage : python3 montage.py source.mp4 plan.json sortie.mp4

Plan :
{
  "title": "Bind · Brimstone", "subtitle": "A default molly",
  "segments": [
    {"type": "clip", "from": 32.6, "to": 35.5, "label": "Result"},
    {"type": "clip", "from": 16.5, "to": 21, "step": 1, "label": "Stand against the spawn barrier"},
    {"type": "freeze", "at": 25.4, "dur": 3.2, "step": 2, "label": "...", "marks": [[900, 978, 50]], "zoom": 2.4},
    {"type": "clip", "from": 27, "to": 35.5, "label": "Time to impact", "chrono": {"start": -1.1, "stop": 7.1}}
  ]
}
Coordonnées des marques en pixels 1920×1080 : [x, y, rayon]. « speed » (optionnel) ralentit un clip.
Polices : Oswald / Bebas Neue (SIL Open Font License) dans tools/fonts/.
"""
import json, math, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
SW, SH = 1920, 1080          # taille de la vidéo source (repères en px 1920×1080)
VERT = False                  # format vertical 9:16 (TikTok / Reels / Shorts)
FW, FH, FY = 1080, 608, 656   # en vertical : image du jeu entière au milieu, fond flou
HERE = os.path.dirname(os.path.abspath(__file__))
F_BOLD = os.path.join(HERE, 'fonts', 'Oswald-Bold.ttf')
F_REG = os.path.join(HERE, 'fonts', 'Oswald-Regular.ttf')
F_NUM = os.path.join(HERE, 'fonts', 'BebasNeue.ttf')
RED = (255, 70, 85, 255)      # rouge Valorant
TEAL = (23, 229, 196, 255)    # turquoise (impact)
DARK = (15, 25, 35, 230)
WHITE = (236, 232, 225, 255)


def font(path, size):
    return ImageFont.truetype(path, size)


def slanted(d, x0, y0, x1, y1, fill, k=18):
    """Bandeau en parallélogramme (style HUD)."""
    d.polygon([(x0 + k, y0), (x1, y0), (x1 - k, y1), (x0, y1)], fill=fill)


def draw_label(d, step, text, y):
    text = text.upper()
    f = font(F_BOLD, 50)
    tw = d.textlength(text, font=f)
    badge = 86 if step else 0
    total = badge + tw + 70
    x = W / 2 - total / 2
    if step:
        slanted(d, x, y, x + badge + 10, y + 86, RED)
        fn = font(F_NUM, 70)
        s = str(step)
        d.text((x + (badge + 10) / 2 - d.textlength(s, font=fn) / 2 + 2, y + 9), s, font=fn, fill=WHITE)
    slanted(d, x + badge, y, x + total, y + 86, DARK)
    d.rectangle([x + badge + 14, y + 80, x + total - 14, y + 86], fill=RED)
    d.text((x + badge + 36, y + 6), text, font=f, fill=WHITE)


def draw_title(d, title, subtitle):
    ft, fs = font(F_NUM, 92), font(F_REG, 40)
    t = title.upper()
    tw = d.textlength(t, font=ft)
    sw = d.textlength(subtitle.upper(), font=fs) if subtitle else 0
    w = max(tw, sw) + 90
    x, y = W / 2 - w / 2, (250 if VERT else 120 / TS)
    h = 150 if subtitle else 100
    slanted(d, x, y, x + w, y + h, DARK, k=26)
    d.rectangle([x + 26, y, x + 40, y + h], fill=RED)
    d.text((x + 60, y + 4), t, font=ft, fill=WHITE)
    if subtitle:
        d.text((x + 62, y + 96), subtitle.upper(), font=fs, fill=RED)


def draw_marks(d, marks):
    for x, y, r in marks:
        for k, a in ((10, 110), (5, 255)):
            d.ellipse([x - r - k, y - r - k, x + r + k, y + r + k], outline=RED[:3] + (a,), width=6)
        ax, ay = x - r * 0.72, y - r * 0.72
        d.line([ax - 150, ay - 150, ax - 18, ay - 18], fill=RED, width=10)
        d.polygon([(ax, ay), (ax - 48, ay - 12), (ax - 12, ay - 48)], fill=RED)


TS = 0.7  # taille des textes et du chrono en horizontal (1 = taille du format vertical)


def overlay(path, seg, plan, first):
    global W, H
    if VERT:
        overlay_full(path, seg, plan, first)
        return
    # Horizontal : on dessine sur une toile agrandie puis on réduit (textes ~30 % plus petits).
    W0, H0 = W, H
    W, H = int(W0 / TS), int(H0 / TS)
    try:
        overlay_full(path, seg, plan, first)
    finally:
        W, H = W0, H0
    Image.open(path).resize((W, H), Image.LANCZOS).save(path)


def overlay_full(path, seg, plan, first):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if first and plan.get('title'):
        draw_title(d, plan['title'], plan.get('subtitle'))
    if seg.get('label'):
        if VERT:
            y = 450 if first and plan.get('title') else 500
        else:
            y = (300 if first and plan.get('title') else 140) / TS
        draw_label(d, seg.get('step'), seg['label'], y)
    im.save(path)


def chrono_frame(e, stop, done):
    """Chronomètre : cadran sombre, anneau qui se remplit, chiffres au centre."""
    S, R = 300, 112
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    cy = c + 12
    col = TEAL if done else RED
    d.rounded_rectangle([c - 22, 4, c + 22, 26], 6, fill=WHITE)              # bouton du haut
    d.rectangle([c - 8, 24, c + 8, cy - R - 6], fill=WHITE)
    for ang in (-45, 45):                                                    # boutons latéraux
        a = math.radians(ang - 90)
        px, py = c + (R + 14) * math.cos(a), cy + (R + 14) * math.sin(a)
        d.ellipse([px - 9, py - 9, px + 9, py + 9], fill=WHITE)
    d.ellipse([c - R - 10, cy - R - 10, c + R + 10, cy + R + 10], fill=DARK)
    d.ellipse([c - R, cy - R, c + R, cy + R], outline=(255, 255, 255, 50), width=12)
    frac = min(e / stop, 1) if stop else 0
    if frac > 0:
        d.arc([c - R, cy - R, c + R, cy + R], -90, -90 + 360 * frac, fill=col, width=12)
    for i in range(12):                                                      # graduations
        a = math.radians(i * 30 - 90)
        r1, r2 = R - 18, R - (30 if i % 3 == 0 else 24)
        d.line([c + r1 * math.cos(a), cy + r1 * math.sin(a), c + r2 * math.cos(a), cy + r2 * math.sin(a)], fill=(255, 255, 255, 120), width=3)
    txt = f'{e:.1f}'
    fn = font(F_NUM, 104)
    d.text((c - d.textlength(txt, font=fn) / 2, cy - 62), txt, font=fn, fill=WHITE)
    sub = 'IMPACT' if done else 'SEC'
    fs = font(F_BOLD, 26)
    d.text((c - d.textlength(sub, font=fs) / 2, cy + 34), sub, font=fs, fill=col)
    return im


def ff(*args):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *args], check=True)


ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2']
# Efface les messages du chat en bas à gauche (« (Broadcast) … set Ghost to On/Off », jusqu'à 3 lignes).
CHAT = 'delogo=x=2:y=950:w=330:h=88'
BASE = f'scale={SW}:{SH}:force_original_aspect_ratio=decrease,pad={SW}:{SH}:(ow-iw)/2:(oh-ih)/2,{CHAT},fps={FPS}'


def compose(inp, out):
    """Image du jeu 1920×1080 → format final (vertical : fond flou + image entière au milieu)."""
    if not VERT:
        return f'[{inp}]null[{out}]'
    return (f'[{inp}]split[{out}a][{out}b];[{out}a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},'
            f'boxblur=24:2,eq=brightness=-0.22[{out}bg];[{out}b]scale={FW}:{FH}[{out}fg];[{out}bg][{out}fg]overlay=0:{FY}[{out}]')


def freeze(src, s, ov, part, tmp):
    """Image figée avec le repère entouré ; zoom rapide sur le repère puis retour au plan large."""
    raw = os.path.join(tmp, 'still.png')
    ff('-ss', str(s['at']), '-i', src, '-frames:v', '1', '-vf', f'scale={SW}:{SH},{CHAT}', raw)
    im = Image.open(raw).convert('RGBA')
    draw_marks(ImageDraw.Draw(im), s.get('marks', []))
    marked = os.path.join(tmp, 'still_marked.png')
    im.convert('RGB').save(marked)
    dur, Z = s['dur'], s.get('zoom', 2.4)
    n = int(dur * FPS)
    a, b = int(0.35 * FPS), int(0.85 * FPS)            # début / fin du zoom avant
    c2, e2 = n - int(0.95 * FPS), n - int(0.45 * FPS)  # début / fin du retour
    ease = lambda p: f'(0.5-0.5*cos(PI*{p}))'
    z = (f"if(lt(in,{a}),1,if(lt(in,{b}),1+{Z - 1}*{ease(f'(in-{a})/{b - a}')},"
         f"if(lt(in,{c2}),{Z},if(lt(in,{e2}),{Z}-{Z - 1}*{ease(f'(in-{c2})/{e2 - c2}')},1))))")
    mx, my = (s['marks'][0][0], s['marks'][0][1]) if s.get('marks') else (SW / 2, SH / 2)
    k = 2  # suréchantillonnage pour un zoom fluide
    x = f"max(0,min(iw-iw/zoom,{mx * k}-iw/zoom/2))"
    y = f"max(0,min(ih-ih/zoom,{my * k}-ih/zoom/2))"
    ff('-loop', '1', '-framerate', str(FPS), '-t', str(dur), '-i', marked, '-loop', '1', '-i', ov,
       '-f', 'lavfi', '-t', str(dur), '-i', 'anullsrc=r=48000:cl=stereo',
       '-filter_complex', f"[0:v]scale={SW * k}:{SH * k},zoompan=z='{z}':x='{x}':y='{y}':d=1:s={SW}x{SH}:fps={FPS}[z];" + compose('z', 'b') + f";[b][1:v]overlay,trim=duration={dur}[v]",
       '-map', '[v]', '-map', '2:a', '-t', str(dur), *ENC, part)


def clip(src, s, ov, part, tmp):
    dur, sp = s['to'] - s['from'], s.get('speed', 1)
    inputs = ['-ss', str(s['from']), '-t', str(dur), '-i', src, '-loop', '1', '-i', ov]
    vf = f"[0:v]{BASE},setpts=PTS/{sp}[g];" + compose('g', 'b') + ";[b][1:v]overlay[o0]"
    last = 'o0'
    if 'chrono' in s:
        ch = s['chrono']
        cdir = os.path.join(tmp, f"chrono{s['from']}")
        os.makedirs(cdir, exist_ok=True)
        for i in range(int(dur / sp * FPS) + 2):
            e = i / FPS * sp - ch['start']
            cf = chrono_frame(max(0, min(e, ch['stop'])), ch['stop'], e >= ch['stop'])
            if not VERT:
                cf = cf.resize((int(300 * TS), int(300 * TS)), Image.LANCZOS)
            cf.save(os.path.join(cdir, f'{i:04d}.png'))
        inputs += ['-framerate', str(FPS), '-i', os.path.join(cdir, '%04d.png')]
        cx, cy = ((W - 300) // 2, FY + FH + 60) if VERT else (W - 270, 120)
        vf += f";[o0][2:v]overlay=x={cx}:y={cy}[o1]"
        last = 'o1'
    afilt = f'atempo={sp}' if sp != 1 else 'anull'
    ff(*inputs, '-filter_complex', vf + f";[0:a]{afilt},aresample=48000[a]", '-map', f'[{last}]', '-map', '[a]',
       '-t', str(dur / sp), *ENC, part)


def main(src, plan_path, out, fmt='horizontal', quality='discord'):
    global W, H, VERT
    plan = json.load(open(plan_path))
    if fmt == 'vertical':
        W, H, VERT = 1080, 1920, True
    tmp = tempfile.mkdtemp()
    parts = []
    for i, s in enumerate(plan['segments']):
        ov = os.path.join(tmp, f'ov{i}.png')
        overlay(ov, s, plan, i == 0)
        part = os.path.join(tmp, f'p{i}.mp4')
        (freeze if s['type'] == 'freeze' else clip)(src, s, ov, part, tmp)
        parts.append(part)
    lst = os.path.join(tmp, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    full = os.path.join(tmp, 'full.mp4')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', full)
    if quality == 'hq':  # pleine qualité (compilation YouTube)
        import shutil
        shutil.copy(full, out)
        print(f'{os.path.getsize(out) / 1e6:.1f} Mo (hq)')
        return
    # Version finale sous ~18 Mo (limite Discord 20 Mo) : débit calculé sur la durée.
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], capture_output=True, text=True).stdout)
    kbps = int(18 * 8 * 1000 / dur) - 128
    ff('-i', full, '-c:v', 'libx264', '-preset', 'medium', '-b:v', f'{kbps}k', '-maxrate', f'{kbps}k', '-bufsize', f'{2 * kbps}k',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out)
    print(f'{dur:.1f} s, {os.path.getsize(out) / 1e6:.1f} Mo')


if __name__ == '__main__':
    main(*sys.argv[1:6])
