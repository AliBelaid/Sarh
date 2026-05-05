"""
Bulk-update hardcoded hex literals to the new PropTech palette.

Maps old Libyan-flag-derived colours to the new slate + orange + cyan set.
Run from repo root:  python scripts/repalette.py
"""

from __future__ import annotations
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Order matters: longer / case-specific patterns first.
HEX_MAP = {
    # Old palette -> new palette
    '#0F1A14': '#0F172A',  # primary
    '#0f1a14': '#0f172a',
    '#1a2a22': '#1e293b',  # primary dark variant
    '#D4AF37': '#F97316',  # accent (gold -> orange)
    '#d4af37': '#f97316',
    '#B8941F': '#C2410C',  # accent dark
    '#b8941f': '#c2410c',
    '#239E46': '#0891B2',  # good (green -> cyan)
    '#239e46': '#0891b2',
    '#E70013': '#DC2626',  # warn
    '#e70013': '#dc2626',
    '#FBFAF6': '#FAFAF9',  # paper
    '#fbfaf6': '#fafaf9',
    '#E6E2D6': '#E5E7EB',  # rule
    '#e6e2d6': '#e5e7eb',
    '#E2DDCB': '#E5E7EB',  # rule (alt spelling)
    '#e2ddcb': '#e5e7eb',
    '#5C6661': '#64748B',  # muted
    '#5c6661': '#64748b',
    '#6B7066': '#64748B',  # muted (alt)
    '#6b7066': '#64748b',
    '#94a39c': '#94a3b8',  # neutral grey
}

# rgba() variants — need looser matching. Map by R,G,B triple.
RGBA_MAP = {
    # gold -> orange-500
    '212, 175, 55': '249, 115, 22',
    '212,175,55':   '249,115,22',
    # green -> cyan-600
    '35, 158, 70':  '8, 145, 178',
    '35,158,70':    '8,145,178',
    # primary slate
    '15, 26, 20':   '15, 23, 42',
    '15,26,20':     '15,23,42',
    # warn red -> red-600
    '231, 0, 19':   '220, 38, 38',
    '231,0,19':     '220,38,38',
}

SKIP_DIRS = {'node_modules', '.git', 'bin', 'obj', 'dist', '.dart_tool', 'build', '.angular', 'target'}
SKIP_FRAGMENTS = (
    '/apps/web-citizen/', '/apps/web-officer/', '/apps/web-id-issuer/',
    '/apps/web-admin/', '/apps/api/', '/infra/supabase/', '_archived',
)
TEXT_EXTS = {'.ts', '.tsx', '.scss', '.css', '.html', '.svg', '.dart', '.md', '.cs', '.json'}


def should_skip(path: Path) -> bool:
    parts = path.parts
    if any(seg in SKIP_DIRS for seg in parts):
        return True
    rel = '/' + str(path.relative_to(REPO_ROOT)).replace(os.sep, '/')
    return any(frag in rel for frag in SKIP_FRAGMENTS)


def rewrite(path: Path) -> bool:
    if path.suffix.lower() not in TEXT_EXTS:
        return False
    try:
        text = path.read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError):
        return False
    new = text
    for old, replacement in HEX_MAP.items():
        new = new.replace(old, replacement)
    for old, replacement in RGBA_MAP.items():
        new = new.replace(old, replacement)
    if new == text:
        return False
    path.write_text(new, encoding='utf-8')
    return True


def main() -> int:
    changed = 0
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if should_skip(Path(dirpath)):
            dirnames[:] = []
            continue
        for fn in filenames:
            p = Path(dirpath) / fn
            if should_skip(p):
                continue
            if rewrite(p):
                changed += 1
                print(f'repaletted {p.relative_to(REPO_ROOT)}')
    print(f'\nDone. {changed} files updated.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
