"""WCAG contrast check for the design tokens (CONVENTIONS.md §5.2).

Converts the OKLCH tokens in src/styles/tokens.css to sRGB and checks the key
foreground/background pairs in both themes. Exits 1 if any pair fails.
Usage: python scripts/check-contrast.py
"""
import math
import pathlib
import re
import sys

TOKENS = pathlib.Path(__file__).resolve().parent.parent / 'styles' / 'tokens.css'

# (foreground, background, minimum ratio). 4.5 = body text, 3.0 = large text / UI graphics.
PAIRS = [
    ('text', 'bg', 4.5), ('text', 'surface', 4.5), ('text-muted', 'surface', 4.5),
    ('text-faint', 'surface', 3.0), ('text-faint', 'bg', 3.0),
    ('accent', 'surface', 3.0), ('text-on-accent', 'accent', 4.5),
    ('text', 'node-bg', 4.5), ('text-muted', 'node-bg', 4.5), ('node-icon', 'node-icon-bg', 4.5),
    ('status-healthy', 'node-bg', 3.0), ('status-degraded', 'node-bg', 3.0),
    ('status-down', 'node-bg', 3.0), ('status-unknown', 'node-bg', 3.0),
    ('area-yellow', 'bg', 3.0), ('area-teal', 'bg', 3.0), ('area-rose', 'bg', 3.0),
    ('note-text', 'note-yellow', 4.5),
]


def parse(block):
    return {m[0]: tuple(map(float, m[1:4]))
            for m in re.findall(r'--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)', block)}


def oklch_to_linear_srgb(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    return [min(1.0, max(0.0, x)) for x in rgb]


def luminance(c):
    r, g, b = oklch_to_linear_srgb(*c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def main():
    src = TOKENS.read_text(encoding='utf-8')
    # light is the default block; dark overrides it
    light = src[src.index(':root,\n:root[data-theme="light"]'):src.index(':root[data-theme="dark"]')]
    dark = src[src.index(':root[data-theme="dark"]'):]
    failed = False
    for name, block in (('light', light), ('dark', dark)):
        tokens = parse(light)
        tokens.update(parse(block))
        for fg, bg, need in PAIRS:
            r = ratio(tokens[fg], tokens[bg])
            ok = r >= need
            failed |= not ok
            print(f"{name:5} {'ok ' if ok else 'LOW'} {fg:>16} on {bg:<15} {r:5.2f} (need {need})")
    print('FAIL' if failed else 'All token pairs meet WCAG AA')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
