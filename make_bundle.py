from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent
out=root/'dist/downloads/ASIC_leet_source.zip'
out.parent.mkdir(parents=True,exist_ok=True)
files=[root/'README.md',root/'make_guide.py',root/'make_bundle.py',*root.joinpath('tests').glob('*'),root/'.github/workflows/pages.yml',*root.joinpath('dist').glob('*')]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(files):
  if p.is_file():z.write(p,'ASIC_leet/'+str(p.relative_to(root)))
print(out)
