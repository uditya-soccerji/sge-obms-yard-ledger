#!/usr/bin/env python3
"""Extract rate lines from SGE PO PDFs into scripts/po-rates-extracted.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader

PO_DIR_CANDIDATES = [
    Path("/Users/udityaair/Desktop/Shree Gayatri/App Related"),
    Path.home() / "Downloads",
    Path.home() / "Desktop",
    Path("/home/ubuntu/.cursor/projects/workspace/uploads"),
]

PO_META = [
    ("PO_560002720 MARINE.pdf", "560002720", ["site-marine"], "2026-02-18"),
    ("PO_560002718-MTF RP-5 ARMA.pdf", "560002718", ["site-mtf"], "2026-02-18"),
    ("PO_560002716 -DTA-CPP.pdf", "560002716", ["site-dta"], "2026-02-18"),
    ("PO_560002714 RP5 MTF.pdf", "560002714", ["site-mtf"], "2026-02-18"),
    ("PO_560002711-MARIN PAINTING.pdf", "560002711", ["site-marine"], "2026-02-18"),
    ("PO_260069439 DTA-PCG (1).pdf", "260069439", ["site-dta", "site-pcg"], "2026-02-18"),
    ("PO_260069431 RP 2 DTA.pdf", "260069431", ["site-dta"], "2026-02-18"),
    ("PO_260069430-DTA ARMA.pdf", "260069430", ["site-dta"], "2026-03-01"),
    ("PO_230261547 MANPOWER SEZ PCG.pdf", "230261547", ["site-pcg"], "2026-07-31"),
]


def find_po(name: str) -> Path | None:
    for d in PO_DIR_CANDIDATES:
        if not d.exists():
            continue
        p = d / name
        if p.exists():
            return p
        for f in d.rglob("*.pdf"):
            if f.name == name or name.lower() in f.name.lower():
                return f
    return None


def extract_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def parse_inr_lines(text, po_number, site_ids, source_file):
    rate_pat = re.compile(
        r"Valid from:\s*(\d{2}\.\d{2}\.\d{4})Valid to:\s*(\d{2}\.\d{2}\.\d{4})\s+([\d,]+\.?\d*)\s+INR/([A-Za-z0-9]+)",
        re.I,
    )
    code_pat = re.compile(r"^(\d{7})\s+(.+?)\s*$", re.M)
    code_matches = list(code_pat.finditer(text))
    lines = []
    for m in rate_pat.finditer(text):
        preceding = [c for c in code_matches if c.start() < m.start()]
        if not preceding or m.start() - preceding[-1].end() > 500:
            continue
        code_m = preceding[-1]
        code = code_m.group(1)
        desc = re.sub(r"\s+", " ", code_m.group(2)).strip()[:120]
        d, mo, y = m.group(1).split(".")
        uom = m.group(4).lower()
        if uom == "m2":
            uom = "m2"
        lines.append(
            {
                "poNumber": po_number,
                "siteIds": site_ids,
                "itemKey": code,
                "description": f"{code} {desc}",
                "uom": uom,
                "rateInr": float(m.group(3).replace(",", "")),
                "effectiveFrom": f"{y}-{mo}-{d}",
                "sourceFile": source_file,
            }
        )
    return lines


def parse_manpower(text, po_number, site_ids, effective_from, source_file):
    pat = re.compile(
        r"(\d{7})\s+([A-Z0-9][A-Z0-9 ./\-]{5,80}?)\s+\d+\.\d+\s+MDY.*?Net value of item\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)",
        re.S | re.I,
    )
    lines = []
    for m in pat.finditer(text):
        lines.append(
            {
                "poNumber": po_number,
                "siteIds": site_ids,
                "itemKey": m.group(1),
                "description": f"{m.group(1)} {re.sub(r'\\s+', ' ', m.group(2)).strip()}",
                "uom": "mdy",
                "rateInr": float(m.group(3).replace(",", "")),
                "effectiveFrom": effective_from,
                "sourceFile": source_file,
            }
        )
    return lines


def main():
    all_lines = []
    summary = []
    missing = []
    for fname, po, sites, ef in PO_META:
        path = find_po(fname)
        if not path:
            missing.append(fname)
            summary.append({"file": fname, "status": "MISSING", "count": 0})
            continue
        text = extract_text(path)
        parsed = parse_inr_lines(text, po, sites, fname) or parse_manpower(
            text, po, sites, ef, fname
        )
        seen = set()
        unique = []
        for L in parsed:
            k = (L["poNumber"], L["itemKey"], L["rateInr"], L["uom"])
            if k in seen:
                continue
            seen.add(k)
            unique.append(L)
        all_lines.extend(unique)
        summary.append(
            {
                "file": fname,
                "po": po,
                "sites": sites,
                "status": "ok",
                "count": len(unique),
            }
        )
    out = Path(__file__).resolve().parent / "po-rates-extracted.json"
    out.write_text(json.dumps({"summary": summary, "lines": all_lines, "missing": missing}, indent=2))
    print(f"Wrote {out} — {len(all_lines)} lines, missing={missing}")


if __name__ == "__main__":
    main()
