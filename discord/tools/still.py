"""Image fixe pour le site, tirée d'une vidéo : python3 still.py source.mp4 secondes sortie.jpg '[[x,y,r],...]'
Image 1920×1080 (chat effacé), repères entourés comme dans le montage, enregistrée en 1280 px de large."""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import montage

src, t, out = sys.argv[1], sys.argv[2], sys.argv[3]
marks = json.loads(sys.argv[4]) if len(sys.argv) > 4 else []
raw = os.path.join(tempfile.mkdtemp(), 'f.png')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', src, '-frames:v', '1', '-vf', f'scale=1920:1080,{montage.CHAT}', raw], check=True)
im = Image.open(raw).convert('RGBA')
montage.draw_marks(ImageDraw.Draw(im), marks)
im.convert('RGB').resize((1280, 720), Image.LANCZOS).save(out, quality=86, optimize=True)
print(out, os.path.getsize(out))
