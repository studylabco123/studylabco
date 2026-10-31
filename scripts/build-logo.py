"""Generate the Study Lab Co logo SVGs.

The lettering is outlined to paths (Lexend 800 for the arched "STUDYLABCO.",
Lexend 400 for "TUTORING") so the logo renders identically when loaded as an
<img>, where web fonts are unavailable. The arc is computed exactly as an SVG
<textPath> would lay it out: each glyph sits on a circle of radius ARC_R,
rotated to the tangent at its midpoint.

Usage (needs `pip install fonttools`):
  python3 scripts/build-logo.py /path/to/Lexend-800.ttf /path/to/Lexend-400.ttf

Writes public/logo.svg, public/logo-mark.svg, src/app/icon.svg and
public/icons/app-icon.svg (the source for the PNG icons; see
scripts/build-icons.mjs).
"""

import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent

# Colours sampled from the owner's logo (see DESIGN.md).
NAVY = "#001A42"
SKY_100 = "#E8F5FE"
SKY_300 = "#B4D6F4"
SKY_500 = "#78B3E8"
PAGE = "#F7FBFF"

CX, CY = 200.0, 200.0
RING_R = 180.0


def fmt(n: float) -> str:
    s = f"{n:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def glyph_path(font: TTFont, ch: str, transform) -> str:
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    pen = SVGPathPen(gs, ntos=fmt)
    gs[name].draw(TransformPen(pen, transform))
    return pen.getCommands()


def advance(font: TTFont, ch: str) -> int:
    name = font.getBestCmap()[ord(ch)]
    return font["hmtx"][name][0]


def arc_text(font: TTFont, text: str, size: float, radius: float, tracking: float, centre_deg: float) -> str:
    """Glyph outlines laid along the top of a circle, reading clockwise."""
    upm = font["head"].unitsPerEm
    s = size / upm
    widths = [advance(font, c) * s for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    # Arc length -> angle (radians) along the baseline circle.
    start = math.radians(centre_deg) - (total / radius) / 2
    paths, pos = [], 0.0
    for c, w in zip(text, widths):
        theta = start + (pos + w / 2) / radius
        px, py = CX + radius * math.sin(theta), CY - radius * math.cos(theta)
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        # glyph (font units, y up) -> centre on advance, flip y, scale, rotate, translate
        a, b = s * cos_t, s * sin_t
        c2, d = s * sin_t, -s * cos_t
        ox = -w / 2
        e = px + ox * cos_t
        f = py + ox * sin_t
        paths.append(glyph_path(font, c, (a, b, c2, d, e, f)))
        pos += w + tracking
    return "".join(paths)


def straight_text(font: TTFont, text: str, size: float, baseline: float, tracking: float) -> str:
    upm = font["head"].unitsPerEm
    s = size / upm
    widths = [advance(font, c) * s for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = CX - total / 2
    out = []
    for c, w in zip(text, widths):
        out.append(glyph_path(font, c, (s, 0, 0, -s, x, baseline)))
        x += w + tracking
    return "".join(out)


def artwork() -> str:
    """Lightbulb with rays over an open book, in the 400x400 logo space."""
    bulb_cx, bulb_cy, bulb_r = 200.0, 142.0, 21.0
    rays = []
    for deg in (-90, -50, -130, -12, -168, 22, 158):
        t = math.radians(deg)
        r1, r2 = bulb_r + 11, bulb_r + 21
        rays.append(
            f'<line x1="{fmt(bulb_cx + r1 * math.cos(t))}" y1="{fmt(bulb_cy + r1 * math.sin(t))}" '
            f'x2="{fmt(bulb_cx + r2 * math.cos(t))}" y2="{fmt(bulb_cy + r2 * math.sin(t))}"/>'
        )
    bulb = f"""
  <g stroke="{SKY_500}" stroke-width="4" stroke-linecap="round">{"".join(rays)}</g>
  <path d="M190 172 C190 164 179 158 179 143 A21 21 0 1 1 221 143 C221 158 210 164 210 172 Z"
        fill="{SKY_300}" stroke="{NAVY}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M207 130 A12 12 0 0 1 213 140" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <path d="M195 171 V157 Q195 150 199 153 L200 155 L201 153 Q205 150 205 157 V171"
        fill="none" stroke="{NAVY}" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="{NAVY}">
    <rect x="189" y="174" width="22" height="4.5" rx="2.25"/>
    <rect x="190" y="181" width="20" height="4.5" rx="2.25"/>
    <rect x="192" y="188" width="16" height="4.5" rx="2.25"/>
    <path d="M195 194 H205 A5 5 0 0 1 195 194 Z"/>
  </g>"""

    # One half of the book, drawn for the right-hand side and mirrored for the left.
    half = f"""
    <path d="M200 286 Q262 262 336 280 L318 236 L200 240 Z" fill="{PAGE}"/>
    <path d="M287 184 L296 184 L334 230 Q256 236 200 283 Q236 214 292 208 Z" fill="{SKY_300}" opacity=".6"/>
    <path d="M277 188 L285 188 L322 232 Q252 238 200 283 Q236 214 292 208 Z" fill="{SKY_300}"/>
    <g fill="{NAVY}">
      <path d="M200 280 Q250 241 309 240 L306 233 L313 233 L319 246 Q256 247 200 282.5 Z"/>
      <path d="M200 282.5 Q260 248 322 250 L328.5 262 Q264 259 200 284.5 Z"/>
      <path d="M200 284.5 Q266 263 330.5 268 L335 279.5 Q268 275 200 287 Z"/>
    </g>
    <path d="M200 240 C206 214 228 192 268 170 L292 208 Q236 214 200 281 Z"
          fill="{PAGE}" stroke="{NAVY}" stroke-width="3.5" stroke-linejoin="round"/>"""
    book = f"""
  <g>
    <g transform="matrix(-1 0 0 1 400 0)">{half}
    </g>{half}
    <path d="M200 240 V282" stroke="{NAVY}" stroke-width="3"/>
    <path d="M187 282 A13 12 0 0 0 213 282 Z" fill="{NAVY}"/>
  </g>"""
    return bulb + book


def main() -> None:
    bold = TTFont(sys.argv[1])
    regular = TTFont(sys.argv[2])

    arc = arc_text(bold, "STUDYLABCO.", size=40, radius=131, tracking=3, centre_deg=3)
    tutoring = straight_text(regular, "TUTORING", size=17, baseline=328, tracking=10.5)
    art = artwork()
    title = "<title>Study Lab Co Tutoring</title>"

    full = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="Study Lab Co Tutoring logo">
  {title}
  <circle cx="200" cy="200" r="{fmt(RING_R)}" fill="{SKY_100}" stroke="{NAVY}" stroke-width="3.5"/>
  <path fill="{NAVY}" d="{arc}"/>
  {art}
  <path fill="{NAVY}" d="{tutoring}"/>
</svg>
"""
    (ROOT / "public/logo.svg").write_text(full)

    # Compact mark: ring hugging the bulb and book, heavier stroke for small sizes.
    def mark(background: str, ring: bool, view: str, cy: float, k: float) -> str:
        ring_el = (
            f'<circle cx="200" cy="200" r="166" fill="{SKY_100}" stroke="{NAVY}" stroke-width="12"/>'
            if ring
            else ""
        )
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="Study Lab Co Tutoring logo">
  {title}
  {background}{ring_el}
  <g transform="translate(200 {cy}) scale({k}) translate(-200 -192)">{art}
  </g>
</svg>
"""

    (ROOT / "public/logo-mark.svg").write_text(mark("", True, "28 28 344 344", 200, 1))
    (ROOT / "src/app/icon.svg").write_text(mark("", True, "28 28 344 344", 200, 1))
    (ROOT / "public/icons").mkdir(parents=True, exist_ok=True)
    # Full-bleed square for home-screen icons; artwork inside the maskable safe zone.
    (ROOT / "public/icons/app-icon.svg").write_text(
        mark(f'<rect width="400" height="400" fill="{SKY_100}"/>', False, "0 0 400 400", 200, 1.12)
    )


if __name__ == "__main__":
    main()
