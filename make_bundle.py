from pathlib import Path
import zipfile

# Packs the whole repository (minus build output and caches) into
# dist/downloads/ASIC_leet_source.zip, which the Sources page links to.
root = Path(__file__).resolve().parent
out = root / 'dist/downloads/ASIC_leet_source.zip'
out.parent.mkdir(parents=True, exist_ok=True)
skip = {'.git', 'node_modules', '.wrangler', '__pycache__'}
files = []
for p in root.rglob('*'):
    rel = p.relative_to(root)
    if not p.is_file() or skip.intersection(rel.parts) or rel.parts[:2] == ('dist', 'downloads'):
        continue
    files.append(p)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):
        z.write(p, 'ASIC_leet/' + p.relative_to(root).as_posix())
print(out, len(files), 'files')
