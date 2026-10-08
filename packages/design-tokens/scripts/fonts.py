"""Reproduce native/brand instances from hash-verified, commit-pinned OFL sources.

Run: uv run --with fonttools --with brotli --with uharfbuzz scripts/fonts.py
"""
from __future__ import annotations
import hashlib
import io
import json
import subprocess
from pathlib import Path
from urllib.request import urlopen
import uharfbuzz as hb
from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
TOKENS = json.loads((ROOT / "tokens.json").read_text())
SOURCE = ROOT / "fonts/source"
STATIC = ROOT / "fonts/static"
BRAND = ROOT / "brand"
PIN = json.loads((SOURCE / "manifest.json").read_text())
UNICODES = set(range(0x20, 0x250)) | set(range(0x2000, 0x2070)) | set(range(0x20A0, 0x20D0)) | set(range(0x2190, 0x2200)) | {0x2212}


def source(family):
    spec = PIN["fonts"]["archivo" if family == "Archivo" else "martianmono"]
    path = SOURCE / spec["file"]
    if not path.exists():
        path.write_bytes(urlopen(spec["url"]).read())
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != spec["sha256"]:
        raise ValueError(f"Source hash mismatch: {path}")
    return TTFont(io.BytesIO(data))


def instance(spec, path):
    font = instantiateVariableFont(source(spec["source"]), {"wght": spec["weight"], "wdth": spec["width"]}, inplace=True)
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    options.name_legacy = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    family = spec["family"]
    values = {1: family, 2: "Regular", 3: f"ZapEngine:{family}", 4: family, 6: family.replace(" ", ""), 16: family, 17: "Regular"}
    for name_id, value in values.items():
        font["name"].removeNames(nameID=name_id)
        font["name"].setName(value, name_id, 3, 1, 0x409)
        font["name"].setName(value, name_id, 1, 0, 0)
    font["head"].modified = font["head"].created
    font.recalcTimestamp = False
    path.parent.mkdir(parents=True, exist_ok=True)
    font.save(path)
    return {**spec, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def outline(path, text):
    data = path.read_bytes()
    font = TTFont(io.BytesIO(data))
    face = hb.Face(data)
    shaping = hb.Font(face)
    shaping.scale = (face.upem, face.upem)
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(shaping, buffer)
    glyphs = font.getGlyphSet()
    names = font.getGlyphOrder()
    paths = []
    x = 0
    bounds = []
    for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
        glyph = glyphs[names[info.codepoint]]
        pen = SVGPathPen(glyphs)
        box = BoundsPen(glyphs)
        glyph.draw(pen)
        glyph.draw(box)
        paths.append({"d": pen.getCommands(), "x": x + position.x_offset, "y": position.y_offset})
        if box.bounds:
            left, bottom, right, top = box.bounds
            bounds.append((left + x + position.x_offset, bottom + position.y_offset, right + x + position.x_offset, top + position.y_offset))
        x += position.x_advance
    left = min(b[0] for b in bounds)
    bottom = min(b[1] for b in bounds)
    right = max(b[2] for b in bounds)
    top = max(b[3] for b in bounds)
    return {"text": text, "unitsPerEm": face.upem, "advance": x, "viewBox": [left, -top, right - left, top - bottom], "paths": paths}


def main():
    STATIC.mkdir(parents=True, exist_ok=True)
    BRAND.mkdir(parents=True, exist_ok=True)
    records = {name: instance(spec, STATIC / spec["file"]) for name, spec in TOKENS["font"]["native"].items()}
    for license_file in SOURCE.glob("*-OFL.txt"):
        (STATIC / license_file.name).write_bytes(license_file.read_bytes())
    (STATIC / "manifest.json").write_text(json.dumps({"sourceCommit": PIN["commit"], "fonts": records}, indent=2) + "\n")
    wordmark = ROOT / "fonts/brand/Archivo-Wordmark.ttf"
    instance({"source": "Archivo", "weight": 640, "width": 108, "family": "Archivo Wordmark"}, wordmark)
    glyphs = {"wordmark": outline(wordmark, "Zap Pilot"), "tagline": outline(STATIC / TOKENS["font"]["native"]["text"]["file"], "Rules decide. You sign.")}
    (BRAND / "glyphs.json").write_text(json.dumps(glyphs, indent=2) + "\n")
    subprocess.run(["pnpm", "exec", "prettier", "--write", str(STATIC / "manifest.json"), str(BRAND / "glyphs.json")], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
