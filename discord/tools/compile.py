"""Compilation YouTube : intro + (transition mini map + montage) par line up.
Usage : python3 compile.py spec.json sortie.mp4
spec = {title, subtitle, minimap (chemin png), items: [{mp4, n, label, tag, from:[x,y], to:[x,y]}]}
Les from/to sont en fraction de la mini map (comme sur le site)."""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import montage as M

W, H, FPS = 1920, 1080, 30
BG = (15, 25, 35)
TEAL = (63, 224, 197)
GREY = (90, 104, 120)


def arrow(d, a, b, col, w):
    import math
    d.line([a, b], fill=col, width=w)
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    L = w * 3.2
    p1 = (b[0] - L * math.cos(ang - 0.45), b[1] - L * math.sin(ang - 0.45))
    p2 = (b[0] - L * math.cos(ang + 0.45), b[1] - L * math.sin(ang + 0.45))
    d.polygon([b, p1, p2], fill=col)


def frame(spec, current=None, intro=False):
    im = Image.new('RGB', (W, H), BG)
    glow = Image.new('RGB', (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-500, -400, 900, 700], fill=(22, 60, 62))
    gd.ellipse([1100, 500, 2400, 1500], fill=(20, 48, 54))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(160)), 0.7).convert('RGBA')
    S = 860
    mx, my = 110, (H - S) // 2
    mm = Image.open(spec['minimap']).convert('RGBA').resize((S, S), Image.LANCZOS)
    box = Image.new('RGBA', (S + 24, S + 24), (11, 19, 27, 255))
    im.alpha_composite(box, (mx - 12, my - 12))
    im.alpha_composite(mm, (mx, my))
    d = ImageDraw.Draw(im)
    d.rectangle([mx - 12, my - 12, mx + S + 12, my + S + 12], outline=TEAL[:3] + (110,), width=2)
    items = spec['items']
    order = [i for i in range(len(items)) if i != current] + ([current] if current is not None else [])
    for i in order:
        it = items[i]
        on = intro or i == current
        col = TEAL if on else GREY
        a = (mx + it['from'][0] * S, my + it['from'][1] * S)
        b = (mx + it['to'][0] * S, my + it['to'][1] * S)
        arrow(d, a, b, col + (255,), 7 if on else 4)
        r = 22 if on else 16
        d.ellipse([b[0] - r, b[1] - r, b[0] + r, b[1] + r], outline=(255, 70, 85, 255 if on else 120), width=5)
        r = 30 if on else 22
        d.ellipse([a[0] - r, a[1] - r, a[0] + r, a[1] + r], fill=col + (255,))
        f = M.font(M.F_NUM, 44 if on else 32)
        t = str(i + 1)
        d.text((a[0] - d.textlength(t, font=f) / 2, a[1] - (24 if on else 18)), t, font=f, fill=BG + (255,))
    x0 = mx + S + 110
    if intro:
        maxw = W - x0 - 70
        sz = 150
        while sz > 60 and d.textlength(spec['title'].upper(), font=M.font(M.F_NUM, sz)) > maxw: sz -= 4
        f1, f2 = M.font(M.F_NUM, sz), M.font(M.F_REG, 54)
        sz3 = 40
        while sz3 > 24 and max(d.textlength(it['label'], font=M.font(M.F_BOLD, sz3)) for it in items) > maxw - 64: sz3 -= 2
        f3 = M.font(M.F_BOLD, sz3)
        d.text((x0, 250), spec['title'].upper(), font=f1, fill=M.WHITE)
        d.text((x0 + 4, 410), spec['subtitle'].upper(), font=f2, fill=M.RED)
        y = 520
        for i, it in enumerate(items):
            d.ellipse([x0, y + 4, x0 + 44, y + 48], fill=TEAL)
            n = str(i + 1)
            fn = M.font(M.F_NUM, 40)
            d.text((x0 + 22 - d.textlength(n, font=fn) / 2, y + 6), n, font=fn, fill=BG)
            d.text((x0 + 64, y), it['label'], font=f3, fill=M.WHITE)
            y += 66
    else:
        it = items[current]
        fbig, fmid, fsm = M.font(M.F_NUM, 260), M.font(M.F_BOLD, 64), M.font(M.F_BOLD, 40)
        d.text((x0, 230), f'{current + 1}', font=fbig, fill=TEAL)
        w = d.textlength(f'{current + 1}', font=fbig)
        d.text((x0 + w + 16, 400), f'/ {len(items)}', font=M.font(M.F_NUM, 90), fill=GREY)
        lines, line = [], ''
        for word in it['label'].upper().split():
            if d.textlength((line + ' ' + word).strip(), font=fmid) > W - x0 - 80:
                lines.append(line); line = word
            else:
                line = (line + ' ' + word).strip()
        lines.append(line)
        y = 540
        for ln in lines:
            d.text((x0, y), ln, font=fmid, fill=M.WHITE); y += 84
        tw = d.textlength(it['tag'].upper(), font=fsm)
        d.rectangle([x0, y + 20, x0 + tw + 40, y + 84], outline=M.WHITE, width=3)
        d.text((x0 + 20, y + 26), it['tag'].upper(), font=fsm, fill=M.WHITE)
        if it.get('impact'):
            d.text((x0, y + 120), f"IMPACT  {str(it['impact']).replace('.', ',')} S", font=fsm, fill=TEAL)
    return im.convert('RGB')


def still_clip(img, dur, out, tmp):
    p = os.path.join(tmp, os.path.basename(out) + '.png')
    img.save(p)
    M.ff('-loop', '1', '-framerate', str(FPS), '-t', str(dur), '-i', p, '-f', 'lavfi', '-t', str(dur), '-i', 'anullsrc=r=48000:cl=stereo',
         '-vf', f"fade=t=in:st=0:d=0.25,fade=t=out:st={dur - 0.25}:d=0.25,format=yuv420p", '-map', '0:v', '-map', '1:a', '-t', str(dur), *M.ENC, out)


def main(spec_path, out):
    spec = json.load(open(spec_path))
    tmp = tempfile.mkdtemp()
    parts = []
    p = os.path.join(tmp, 'intro.mp4'); still_clip(frame(spec, intro=True), 4.0, p, tmp); parts.append(p)
    for i, it in enumerate(spec['items']):
        p = os.path.join(tmp, f't{i}.mp4'); still_clip(frame(spec, current=i), 2.2, p, tmp); parts.append(p)
        parts.append(it['mp4'])
    inputs, fc = [], ''
    for k, p in enumerate(parts):
        inputs += ['-i', p]
        fc += f'[{k}:v]scale={W}:{H},fps={FPS},setsar=1,format=yuv420p[v{k}];[{k}:a]aresample=48000,aformat=channel_layouts=stereo[a{k}];'
    fc += ''.join(f'[v{k}][a{k}]' for k in range(len(parts))) + f'concat=n={len(parts)}:v=1:a=1[v][a]'
    M.ff(*inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out)
    frame(spec, intro=True).save(os.path.splitext(out)[0] + '-miniature.jpg', quality=90)
    print(out, f'{os.path.getsize(out) / 1e6:.1f} Mo')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
