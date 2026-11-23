"""Liste les vidéos du dossier Google Drive partagé (variable DRIVE_FOLDER) sans les télécharger.
Sortie JSON : [{"id": ..., "name": ...}] (le lien du dossier n'est jamais affiché)."""
import json, os, sys, io, contextlib
import gdown

url = os.environ.get('DRIVE_FOLDER', '').strip()
if not url:
    print('[]'); sys.exit(0)
buf = io.StringIO()
with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
    files = gdown.download_folder(url=url, skip_download=True, quiet=True, use_cookies=False) or []
if not files:
    import re
    msg = re.sub(r'[\w-]{25,}', '<id>', buf.getvalue())[-600:]
    print(msg.replace('\n', ' | '), file=sys.stderr)
out = [{'id': f.id, 'name': os.path.basename(f.path)} for f in files if f.path.lower().endswith(('.mp4', '.mov', '.mkv', '.webm'))]
print(json.dumps(out, ensure_ascii=False))
