"""Montage d'une line up à partir d'une vidéo source et d'un plan (JSON).

Usage : python3 montage.py source.mp4 plan.json sortie.mp4

Plan :
{
  "title": "Bind · Brimstone · A défaut",
  "segments": [
    {"type": "clip", "from": 32.6, "to": 35.5, "label": "Le résultat"},
    {"type": "freeze", "at": 25.5, "dur": 3, "label": "...", "marks": [[900, 978, 48]]},
    {"type": "clip", "from": 25.5, "to": 27, "speed": 0.5, "label": "..."},
    {"type": "clip", "from": 27, "to": 35.5, "label": "...", "chrono": {"start": -1.1, "stop": 7.1}}
  ]
}
Les coordonnées des marques sont en pixels de la vidéo source (1920×1080), [x, y, rayon].
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
ACCENT = (255, 70, 85, 255)  # rouge Valorant


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def overlay(path, label=None, title=None, marks=()):
    """Image transparente : bandeau titre en haut, étiquette en bas, cercles sur les repères."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if title:
        f = font(46)
        w = d.textlength(title, font=f)
        d.rounded_rectangle([W / 2 - w / 2 - 30, 150, W / 2 + w / 2 + 30, 230], 18, fill=(15, 25, 35, 215))
        d.text((W / 2 - w / 2, 164), title, font=f, fill=(255, 255, 255, 255))
    if label:
        f = font(54)
        w = d.textlength(label, font=f)
        y = 250 if title else 160  # en haut : le bas de l'écran (HUD) sert souvent de repère
        d.rounded_rectangle([W / 2 - w / 2 - 34, y, W / 2 + w / 2 + 34, y + 92], 20, fill=(15, 25, 35, 225))
        d.rectangle([W / 2 - w / 2 - 34, y, W / 2 - w / 2 - 22, y + 92], fill=ACCENT)
        d.text((W / 2 - w / 2, y + 14), label, font=f, fill=(255, 255, 255, 255))
    for x, y, r in marks:
        for k, a in ((10, 120), (6, 255)):
            d.ellipse([x - r - k, y - r - k, x + r + k, y + r + k], outline=ACCENT[:3] + (a,), width=6)
        # flèche qui pointe vers le repère depuis le haut à gauche
        d.line([x - r - 140, y - r - 140, x - r * 0.75, y - r * 0.75], fill=ACCENT, width=10)
        d.polygon([(x - r * 0.7, y - r * 0.7), (x - r * 0.7 - 46, y - r * 0.7 - 10), (x - r * 0.7 - 10, y - r * 0.7 - 46)], fill=ACCENT)
    im.save(path)


def ff(*args):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *args], check=True)


def main(src, plan_path, out):
    plan = json.load(open(plan_path))
    tmp = tempfile.mkdtemp()
    parts = []
    base = f'scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS}'
    for i, s in enumerate(plan['segments']):
        ov = os.path.join(tmp, f'ov{i}.png')
        overlay(ov, s.get('label'), plan.get('title') if i == 0 else None, s.get('marks', []))
        part = os.path.join(tmp, f'p{i}.mp4')
        if s['type'] == 'freeze':
            # image figée + léger zoom vers le repère, sans son
            ff('-ss', str(s['at']), '-i', src, '-loop', '1', '-i', ov, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
               '-filter_complex', f"[0:v]trim=end_frame=1,{base},loop=loop=-1:size=1,trim=duration={s['dur']},setpts=N/{FPS}/TB[b];[b][1:v]overlay[v]",
               '-map', '[v]', '-map', '2:a', '-t', str(s['dur']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', part)
        else:
            dur = s['to'] - s['from']
            sp = s.get('speed', 1)
            vf = f"[0:v]{base},setpts=PTS/{sp}[b];[b][1:v]overlay"
            if 'chrono' in s:
                c = s['chrono']
                # temps écoulé depuis le lancer, figé à l'arrivée
                e = f"min(t+{-c['start']}\\,{c['stop']})"
                txt = f"%{{eif\\:trunc({e})\\:d}},%{{eif\\:trunc(mod({e}*10\\,10))\\:d}} s"
                vf += f"[o];[o]drawbox=x=1580:y=60:w=280:h=110:color=0x0f1923@0.85:t=fill,drawtext=fontfile={FONT}:text='{txt}':x=1720-text_w/2:y=82:fontsize=64:fontcolor=white"
            vf += '[v]'
            afilt = f"atempo={sp}" if sp >= 0.5 else 'anull'
            ff('-ss', str(s['from']), '-t', str(dur), '-i', src, '-loop', '1', '-i', ov,
               '-filter_complex', vf + f";[0:a]{afilt},aresample=48000[a]", '-map', '[v]', '-map', '[a]',
               '-t', str(dur / sp), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', part)
        parts.append(part)
    lst = os.path.join(tmp, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    full = os.path.join(tmp, 'full.mp4')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', full)
    # Version finale sous ~18 Mo (limite Discord 20 Mo) : débit calculé sur la durée.
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], capture_output=True, text=True).stdout)
    kbps = int(18 * 8 * 1000 / dur) - 128
    ff('-i', full, '-c:v', 'libx264', '-preset', 'medium', '-b:v', f'{kbps}k', '-maxrate', f'{kbps}k', '-bufsize', f'{2 * kbps}k',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out)
    print(f'{dur:.1f} s, {os.path.getsize(out) / 1e6:.1f} Mo')


if __name__ == '__main__':
    main(*sys.argv[1:4])
