"""
Fix double-encoded Arabic text in the sijilli database.

Background: sqlcmd was invoked without `-f 65001`, so UTF-8 .sql files were read
as Windows-1252. The Arabic UTF-8 bytes were therefore stored as the wrong
NVARCHAR codepoints. This script reverses the encoding pass on every Arabic
column we know about.

Usage:  python scripts/db/fix-arabic-encoding.py
"""

from __future__ import annotations
import pyodbc
import sys

CONN = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost,1433;"
    "DATABASE=sijilli;"
    "UID=sijilli_app;PWD=SijilliDevPwd!2026;"
    "TrustServerCertificate=yes;Encrypt=yes;"
)

# table -> id_col -> [arabic_columns]
TARGETS: dict[tuple[str, str], list[str]] = {
    ("citizens",  "id"): [
        "first_name_ar", "father_name_ar", "grandfather_name_ar", "family_name_ar",
        "mother_name_ar", "birth_place", "address_ar",
    ],
    ("officers",  "id"): ["full_name_ar"],
    ("regions",   "id"): ["name_ar"],
    ("properties","id"): ["address_ar"],
}


def arabic_count(s: str) -> int:
    return sum(1 for c in s if 0x0600 <= ord(c) <= 0x06FF)


def looks_double_encoded(s: str) -> bool:
    """Detect if any portion of the string is mojibake from a UTF-8→CP1252 pass."""
    if not s:
        return False
    return any(c in s for c in "ØÙÚÛÜø…‰‚„¦¯©®¶")


def fix(s: str) -> str:
    """Re-encode the wrong-decoded UTF-8 bytes. If decode strict fails, fall
    back to char-by-char fix where possible."""
    try:
        return s.encode("cp1252", errors="strict").decode("utf-8", errors="strict")
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Char-by-char: replace runs of mojibake codepoints, leave proper Arabic alone.
        out = []
        buf: list[int] = []
        def flush():
            if not buf:
                return
            try:
                out.append(bytes(buf).decode("utf-8", errors="strict"))
            except UnicodeDecodeError:
                out.append("".join(chr(b) for b in buf))
            buf.clear()
        for ch in s:
            cp = ord(ch)
            # CP1252 single-byte range — convert via cp1252 mapping
            if cp < 0x100 and cp != 0x0A and cp != 0x0D and cp >= 0x20:
                buf.append(cp)
            elif 0x2018 <= cp <= 0x2122:  # general punctuation often from cp1252
                try:
                    buf.append(ch.encode("cp1252")[0])
                except UnicodeEncodeError:
                    flush(); out.append(ch)
            else:
                flush(); out.append(ch)
        flush()
        result = "".join(out)
        # Only accept if the fix actually produced more Arabic than the input.
        return result if arabic_count(result) > arabic_count(s) else s


def main() -> int:
    cn = pyodbc.connect(CONN, autocommit=False)
    cur = cn.cursor()

    total_fixed = 0
    for (table, id_col), cols in TARGETS.items():
        # Probe each column and keep only the ones that exist.
        existing: list[str] = []
        for c in cols:
            try:
                cur.execute(f"SELECT TOP 1 {c} FROM {table}")
                existing.append(c)
            except pyodbc.Error:
                pass
        if not existing:
            print(f"skip {table}: no Arabic columns")
            continue

        cols_csv = ", ".join(existing)
        cols = existing
        cur.execute(f"SELECT {id_col}, {cols_csv} FROM {table}")
        rows = cur.fetchall()
        for row in rows:
            row_id = row[0]
            updates: dict[str, str] = {}
            for i, col in enumerate(cols, start=1):
                value = row[i]
                if isinstance(value, str) and looks_double_encoded(value):
                    fixed_val = fix(value)
                    if fixed_val != value and arabic_count(fixed_val) > arabic_count(value):
                        updates[col] = fixed_val

            if not updates:
                continue

            set_clause = ", ".join(f"{c} = ?" for c in updates)
            params = list(updates.values()) + [row_id]
            cur.execute(f"UPDATE {table} SET {set_clause} WHERE {id_col} = ?", params)
            total_fixed += 1
            sample = next(iter(updates.values()))[:30]
            print(f"  {table}/{row_id}: {len(updates)} cols → {sample}…")
        cn.commit()  # commit per-table so a later failure doesn't roll back earlier work

    cn.commit()
    cur.close()
    cn.close()
    print(f"\nDone. {total_fixed} rows fixed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
