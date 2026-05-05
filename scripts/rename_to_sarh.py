"""
One-shot renamer: Sijilli -> Sarh across all active source files.

Walks the active source dirs (excludes node_modules, bin/obj, build outputs,
and the legacy /apps/{web-citizen,web-officer,web-id-issuer,web-admin,api}/
+ /infra/supabase/ trees). For each text file containing 'sijilli' in any
case, performs four ordered replacements that preserve case:

    Sijilli  -> Sarh
    sijilli  -> sarh
    SIJILLI  -> SARH
    سِجِلّي    -> صَرح

Run from repo root:  python scripts/rename_to_sarh.py
"""

from __future__ import annotations
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Directories or path *fragments* to skip entirely.
SKIP_DIRS = {
    'node_modules', '.git', 'bin', 'obj', 'dist', '.dart_tool', 'build',
    '.angular', 'target', '__pycache__', '.idea', '.vscode',
}
SKIP_PATH_FRAGMENTS = (
    # Legacy apps kept in repo only for component migration.
    '/apps/web-citizen/', '/apps/web-officer/',
    '/apps/web-id-issuer/', '/apps/web-admin/',
    '/apps/api/',                   # retired NestJS
    '/infra/supabase/',             # retired Postgres
    '/docs/_archived_',
)

# File extensions we treat as text and rewrite in place.
TEXT_EXTS = {
    '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.scss', '.css',
    '.cs', '.csproj', '.sln', '.props', '.targets',
    '.md', '.mmd', '.svg', '.txt', '.yml', '.yaml', '.toml', '.env',
    '.sql', '.ps1', '.sh', '.bat',
    '.dart', '.kt', '.gradle', '.xml', '.plist', '.entitlements',
    '.proxy', '.gitignore', '.editorconfig',
}

REPLACEMENTS = [
    ('Sijilli', 'Sarh'),
    ('sijilli', 'sarh'),
    ('SIJILLI', 'SARH'),
    ('سِجِلّي', 'صَرح'),
]


def should_skip(path: Path) -> bool:
    parts = path.parts
    if any(seg in SKIP_DIRS for seg in parts):
        return True
    rel = '/' + str(path.relative_to(REPO_ROOT)).replace(os.sep, '/') + ('/' if path.is_dir() else '')
    return any(frag in rel for frag in SKIP_PATH_FRAGMENTS)


def should_rewrite(path: Path) -> bool:
    if not path.is_file():
        return False
    if should_skip(path):
        return False
    if path.suffix.lower() in TEXT_EXTS:
        return True
    if path.name in {'Dockerfile', 'Makefile'}:
        return True
    return False


def rewrite(path: Path) -> bool:
    try:
        raw = path.read_bytes()
    except OSError:
        return False

    # Quick test: does the file mention sijilli at all? Avoid utf-8 decode for
    # files that don't.
    lower = raw.lower()
    if b'sijilli' not in lower and 'سِجِلّي'.encode('utf-8') not in raw:
        return False

    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        # Try utf-8-sig (BOM)
        try:
            text = raw.decode('utf-8-sig')
            had_bom = True
        except UnicodeDecodeError:
            return False
    else:
        had_bom = raw.startswith(b'\xef\xbb\xbf')

    new = text
    for old, replacement in REPLACEMENTS:
        new = new.replace(old, replacement)

    if new == text:
        return False

    out = new.encode('utf-8')
    if had_bom:
        out = b'\xef\xbb\xbf' + out
    path.write_bytes(out)
    return True


def main() -> int:
    changed = 0
    walked = 0
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        # Mutate dirnames in-place so os.walk skips them.
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        # Also skip if the *current* path matches a fragment.
        dp = Path(dirpath)
        if should_skip(dp):
            dirnames[:] = []
            continue
        for fn in filenames:
            walked += 1
            p = dp / fn
            if should_rewrite(p) and rewrite(p):
                changed += 1
                print(f'rewrote {p.relative_to(REPO_ROOT)}')
    print(f'\nDone. {changed} files rewritten ({walked} files scanned).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
