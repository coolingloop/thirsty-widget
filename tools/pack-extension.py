"""Zip extension/ for the Chrome Web Store and for manual installs.

python tools/pack-extension.py [out.zip]   (default: dist/thirsty-extension.zip)
Paths use forward slashes and fixed timestamps, so the same source gives the same zip.
"""
from pathlib import Path
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'extension'
SKIP = {'README.md', '.DS_Store', 'Thumbs.db'}  # and the test/ folder


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist' / 'thirsty-extension.zip'
    out = out if out.is_absolute() else Path.cwd() / out
    out.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))
    files = sorted(p for p in SRC.rglob('*') if p.is_file() and p.name not in SKIP and 'test' not in p.relative_to(SRC).parts)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            info = zipfile.ZipInfo(p.relative_to(SRC).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, p.read_bytes())
    print(f"{out} ({out.stat().st_size:,} bytes, {len(files)} files, {manifest['name']} {manifest['version']})")


if __name__ == '__main__':
    main()
