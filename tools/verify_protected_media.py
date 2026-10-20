#!/usr/bin/env python3
"""
Integrity checker for a protected-media folder (hash verification only).

This tool does NOT decrypt or convert anything. It answers one question:
"Are the files I have intact and consistent with manifest.json?"

What it verifies
----------------
1. ORIGINAL (plaintext) files
   A file is PASS when SHA-256(file) == record["sha256"] and its size
   equals record["bytes"] from protected-media/manifest.json.
   Files are matched by content hash, so their names may differ.

2. PROTECTED (.bin) files
   A .bin is PASS when SHA-256(.bin) equals the digest recorded for it
   in the APK signing manifest (META-INF/MANIFEST.MF, SHA-256-Digest).
   NOTE: record["sha256"] in manifest.json is the hash of the ORIGINAL
   (plaintext) media, so it must NOT be compared against the .bin hash.
   Without MANIFEST.MF a .bin can only be reported UNVERIFIED (plus a
   structural size check); integrity cannot be confirmed from manifest
   alone.

3. manifest.json itself
   When MANIFEST.MF is available, the tool also checks that the
   manifest.json you are using is byte-identical to the one the APK
   was signed with.

Usage
-----
    # Folder that contains the .bin files + manifest.json
    python3 tools/verify_protected_media.py "path/to/protected-media"

    # Folder that contains recovered/source ORIGINAL media files
    python3 tools/verify_protected_media.py "path/to/originals" --mode original

    # Explicit manifests + JSON report
    python3 tools/verify_protected_media.py "protected-media" \
        --manifest "protected-media/manifest.json" \
        --apk-manifest "testing v5/original/META-INF/MANIFEST.MF" \
        --json integrity-report.json

    # Prove the checker itself works (synthetic fixtures, no real media)
    python3 tools/verify_protected_media.py --self-test

Exit code: 0 = every record verified; 1 = failures, or missing files
(unless --allow-missing), or unverified records with --strict.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

CHUNK = 1024 * 1024
HEXHASH = re.compile(r"^[a-f0-9]{64}$")
APK_PREFIX = "assets/public/assets/protected-media"
# Sealed .bin layout carries 12-byte IV + 16-byte GCM tag on top of the
# plaintext length. Used ONLY as a structural sanity check when no
# signing digest is available; it is not an integrity proof.
SEALED_OVERHEAD = 28


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def parse_apk_manifest(path: Path) -> dict[str, str]:
    """Parse META-INF/MANIFEST.MF -> {entry name: sha256 hex digest}."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    text = text.replace("\r\n ", "").replace("\n ", "")  # unfold lines
    entries: dict[str, str] = {}
    for name, b64 in re.findall(r"Name: (\S+)\s+SHA-256-Digest: (\S+)", text):
        try:
            entries[name] = base64.b64decode(b64).hex()
        except Exception:
            pass
    return entries


def first_existing(candidates) -> Path | None:
    for c in candidates:
        if c and Path(c).exists():
            return Path(c)
    return None


def validate_manifest(data) -> list[str]:
    errors = []
    if not isinstance(data, dict):
        return ["manifest root is not a JSON object"]
    records = data.get("records")
    if not isinstance(records, dict) or not records:
        return ["manifest has no 'records' object"]
    seen_records, seen_sha = set(), set()
    for key, row in records.items():
        if not isinstance(row, dict):
            errors.append(f"record {key}: not an object")
            continue
        for field in ("record", "mime", "bytes", "sha256"):
            if field not in row:
                errors.append(f"record {key}: missing field {field}")
        sha = str(row.get("sha256", ""))
        if not HEXHASH.match(sha):
            errors.append(f"record {key}: sha256 is not 64-char hex")
        if row.get("record") in seen_records:
            errors.append(f"duplicate record file name: {row.get('record')}")
        if sha in seen_sha:
            errors.append(f"duplicate sha256 value at record {key}")
        seen_records.add(row.get("record"))
        seen_sha.add(sha)
        try:
            if int(row.get("bytes", -1)) <= 0:
                errors.append(f"record {key}: bytes must be > 0")
        except (TypeError, ValueError):
            errors.append(f"record {key}: bytes is not an integer")
    return errors


def verify(folder: Path, manifest_path: Path,
           apk_manifest_path: Path | None, mode: str) -> dict:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    schema_errors = validate_manifest(data)
    records = data.get("records", {}) if isinstance(data, dict) else {}
    apk_entries = parse_apk_manifest(apk_manifest_path) if apk_manifest_path else {}

    manifest_self = "UNVERIFIED"
    expected_self = apk_entries.get(f"{APK_PREFIX}/manifest.json")
    manifest_hash = sha256_file(manifest_path)
    if expected_self:
        manifest_self = "PASS" if manifest_hash == expected_self else "FAIL"

    files = [p for p in sorted(folder.rglob("*"))
             if p.is_file() and p.resolve() != manifest_path.resolve()]
    file_sha: dict[Path, str] = {}
    by_sha: dict[str, list[Path]] = defaultdict(list)
    by_name: dict[str, list[Path]] = defaultdict(list)
    by_stem: dict[str, list[Path]] = defaultdict(list)
    for p in files:
        digest = sha256_file(p)
        file_sha[p] = digest
        by_sha[digest].append(p)
        by_name[p.name].append(p)
        by_stem[p.stem].append(p)

    used: set[Path] = set()
    rows = []
    for key, row in records.items():
        rec_name = str(row.get("record", ""))
        rec_sha = str(row.get("sha256", ""))
        rec_bytes = int(row.get("bytes") or 0)
        result = {"key": key, "record": rec_name, "mime": row.get("mime"),
                  "declared_bytes": rec_bytes, "status": "MISSING",
                  "method": None, "matched_file": None, "detail": ""}

        def original_match():
            for cand in by_sha.get(rec_sha, []):
                if cand.stat().st_size == rec_bytes:
                    return cand
            return None

        def protected_match():
            cands = by_name.get(rec_name, [])
            return cands[0] if cands else None

        def check_protected(cand: Path):
            expected = apk_entries.get(f"{APK_PREFIX}/{rec_name}")
            result["matched_file"] = str(cand)
            if expected:
                ok = file_sha[cand] == expected
                result["status"] = "PASS" if ok else "FAIL"
                result["method"] = "sha256(.bin) vs APK MANIFEST.MF"
                result["detail"] = ("encrypted file matches signed-APK digest"
                                    if ok else
                                    "encrypted file digest differs from signed-APK digest")
            else:
                delta = cand.stat().st_size - rec_bytes
                plausible = delta in (0, SEALED_OVERHEAD)
                result["status"] = "UNVERIFIED" if plausible else "FAIL"
                result["method"] = "structural size only (no MANIFEST.MF)"
                result["detail"] = (f"file size - declared bytes = {delta}; "
                                    "pass MANIFEST.MF to confirm by hash")

        if mode in ("auto", "original"):
            cand = original_match()
            if cand is not None:
                used.add(cand)
                result.update(status="PASS",
                              method="sha256(original) vs manifest record",
                              matched_file=str(cand),
                              detail="original file hash and size match")
                rows.append(result)
                continue
        if mode in ("auto", "protected"):
            cand = protected_match()
            if cand is not None:
                used.add(cand)
                check_protected(cand)
                rows.append(result)
                continue
        # A same-stem media file whose hash differs is a corrupted
        # original, not merely a missing one.
        stem = Path(rec_name).stem
        stem_hits = [p for p in by_stem.get(stem, []) if p.suffix.lower() != ".bin"]
        if stem_hits and mode in ("auto", "original"):
            used.add(stem_hits[0])
            result.update(status="FAIL",
                          method="sha256(original) vs manifest record",
                          matched_file=str(stem_hits[0]),
                          detail="same-name original found but hash differs (corrupt/changed)")
        rows.append(result)

    extra = [str(p) for p in files if p not in used]
    counts = Counter(r["status"] for r in rows)
    return {
        "folder": str(folder),
        "mode": mode,
        "manifest": {"path": str(manifest_path), "sha256": manifest_hash,
                     "records": len(records), "self_check_vs_apk": manifest_self,
                     "schema_errors": schema_errors},
        "apk_manifest": str(apk_manifest_path) if apk_manifest_path else None,
        "summary": {"records": len(rows), "pass": counts.get("PASS", 0),
                    "fail": counts.get("FAIL", 0), "missing": counts.get("MISSING", 0),
                    "unverified": counts.get("UNVERIFIED", 0), "extra_files": len(extra)},
        "records_detail": rows,
        "extra_files": extra,
    }


def print_report(rep: dict, verbose: bool, limit: int) -> None:
    m, s = rep["manifest"], rep["summary"]
    print(f"Manifest : {m['path']}  (records={m['records']}, self-check vs APK: {m['self_check_vs_apk']})")
    for e in m["schema_errors"]:
        print(f"  SCHEMA ERROR: {e}")
    print(f"Mode     : {rep['mode']}")
    shown = 0
    for r in rep["records_detail"]:
        if r["status"] == "PASS" and not verbose:
            continue
        if shown >= limit and not verbose:
            print(f"  ... ({s['fail'] + s['missing'] + s['unverified'] - shown} more, use --verbose or --json)")
            break
        print(f"  [{r['status']:<10}] {r['key']} {r['record']}  {r['detail']}")
        shown += 1
    if rep["extra_files"]:
        print(f"Extra files not in manifest: {len(rep['extra_files'])} (first 5)")
        for p in rep["extra_files"][:5]:
            print(f"  EXTRA {p}")
    print(f"Summary  : records={s['records']} PASS={s['pass']} FAIL={s['fail']} "
          f"MISSING={s['missing']} UNVERIFIED={s['unverified']} EXTRA={s['extra_files']}")
    verdict = "HEALTHY" if (s["fail"] == 0 and s["pass"] == s["records"] and not m["schema_errors"]) else "NOT FULLY VERIFIED"
    print(f"Verdict  : {verdict}")


# --------------------------------------------------------------------------
# Self-test: synthetic fixtures prove pass / corrupt / missing detection,
# in both original and protected modes, without any real media or keys.
# --------------------------------------------------------------------------
def self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        orig = {k: (f"original-{k}-".encode() * 500)
                for k in ("aaaaaaaa", "bbbbbbbb", "cccccccc")}
        records = {}
        for k, blob in orig.items():
            records[k] = {"record": f"{k}1122334455667788.bin", "mime": "image/jpeg",
                          "bytes": len(blob),
                          "sha256": hashlib.sha256(blob).hexdigest()}
        manifest_path = root / "manifest.json"
        manifest_path.write_text(json.dumps(
            {"version": 1, "algorithm": "A256GCM", "records": records}), encoding="utf-8")

        # original mode: one intact, one corrupted (same stem), one missing
        odir = root / "originals"; odir.mkdir()
        (odir / "anything.jpg").write_bytes(orig["aaaaaaaa"])
        (odir / "bbbbbbbb1122334455667788.jpg").write_bytes(orig["bbbbbbbb"] + b"X")
        rep = verify(odir, manifest_path, None, "original")
        assert rep["summary"] == {"records": 3, "pass": 1, "fail": 1,
                                  "missing": 1, "unverified": 0, "extra_files": 0}, rep["summary"]

        # protected mode: fake sealed blobs, digests provided via a
        # synthetic MANIFEST.MF; second file is tampered after signing
        pdir = root / "protected"; pdir.mkdir()
        sealed = {"aaaaaaaa": b"S" * (len(orig["aaaaaaaa"]) + SEALED_OVERHEAD),
                  "bbbbbbbb": b"T" * (len(orig["bbbbbbbb"]) + SEALED_OVERHEAD)}
        mf_lines = []
        for k, blob in sealed.items():
            (pdir / records[k]["record"]).write_bytes(blob)
            signed = blob if k == "aaaaaaaa" else blob + b"tampered-before-write"
            digest = base64.b64encode(bytes.fromhex(
                hashlib.sha256(signed).hexdigest())).decode()
            mf_lines.append(f"Name: {APK_PREFIX}/{records[k]['record']}\nSHA-256-Digest: {digest}\n")
        mf_path = root / "MANIFEST.MF"
        mf_path.write_text("\n".join(mf_lines), encoding="utf-8")
        rep = verify(pdir, manifest_path, mf_path, "protected")
        assert rep["summary"] == {"records": 3, "pass": 1, "fail": 1,
                                  "missing": 1, "unverified": 0, "extra_files": 0}, rep["summary"]
    print("SELF-TEST OK: intact=PASS, corrupted=FAIL, absent=MISSING detected in both modes")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Verify protected-media / original media integrity by SHA-256 (no decryption).")
    ap.add_argument("folder", nargs="?", help="folder containing the files to verify")
    ap.add_argument("--manifest", help="path to protected-media manifest.json")
    ap.add_argument("--apk-manifest", help="path to META-INF/MANIFEST.MF from the signed APK")
    ap.add_argument("--mode", choices=("auto", "original", "protected"), default="auto")
    ap.add_argument("--json", dest="json_out", help="also write a full JSON report to this path")
    ap.add_argument("--verbose", action="store_true", help="list PASS rows too")
    ap.add_argument("--limit", type=int, default=20, help="max problem rows to print (default 20)")
    ap.add_argument("--allow-missing", action="store_true",
                    help="missing records do not affect the exit code")
    ap.add_argument("--strict", action="store_true",
                    help="UNVERIFIED records and extra files also fail the run")
    ap.add_argument("--self-test", action="store_true", help="run synthetic-fixture self-test and exit")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    folder = first_existing([
        args.folder,
        "assets/public/assets/protected-media",
        "testing v5/assets/public/assets/protected-media",
        ".",
    ])
    manifest_path = first_existing([
        args.manifest,
        folder / "manifest.json" if folder else None,
        "assets/public/assets/protected-media/manifest.json",
        "testing v5/assets/public/assets/protected-media/manifest.json",
    ])
    if folder is None or manifest_path is None:
        print("ERROR: folder or manifest.json not found (pass them explicitly)", file=sys.stderr)
        return 2
    apk_manifest_path = first_existing([
        args.apk_manifest,
        "testing v5/original/META-INF/MANIFEST.MF",
    ])

    rep = verify(Path(folder), Path(manifest_path),
                 Path(apk_manifest_path) if apk_manifest_path else None, args.mode)
    print_report(rep, args.verbose, args.limit)
    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON report written: {args.json_out}")

    s = rep["summary"]
    failed = bool(rep["manifest"]["schema_errors"]) or s["fail"] > 0 \
        or rep["manifest"]["self_check_vs_apk"] == "FAIL" \
        or (s["missing"] > 0 and not args.allow_missing) \
        or (args.strict and (s["unverified"] > 0 or s["extra_files"] > 0))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
