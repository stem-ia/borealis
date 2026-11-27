#!/usr/bin/env python3
"""Check the Borealis palette: WCAG contrast and colour-blind separation.

Run: python3 map/tools/check_colours.py
Needs: colorspacious (pip install --break-system-packages colorspacious)

Separation uses CAM02-UCS distance (roughly: 10+ is easy to tell apart at map
scale, under 6 is risky) after simulating protanopia, deuteranopia and
tritanopia at full severity (Machado 2009).
"""
import itertools
import re
import os
import warnings

warnings.filterwarnings("ignore")
from colorspacious import cspace_convert, deltaE  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CSS = open(os.path.join(HERE, "..", "tokens.css")).read()


def var(name):
    m = re.search(r"--" + re.escape(name) + r":\s*(#[0-9A-Fa-f]{6})", CSS)
    return m.group(1)


def rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def lum(h):
    def ch(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def sim(h, kind):
    if kind == "normal":
        return rgb(h)
    s = {"cvd_type": kind, "severity": 100}
    return [min(1, max(0, c)) for c in cspace_convert(rgb(h), {"name": "sRGB1+CVD", "cvd_type": kind, "severity": 100}, "sRGB1")]


def dist(a, b, kind):
    return deltaE(sim(a, kind), sim(b, kind), input_space="sRGB1", uniform_space="CAM02-UCS")


KINDS = ["normal", "protanomaly", "deuteranomaly", "tritanomaly"]


def separation(group, pairs=None, label=""):
    names = list(group)
    pairs = pairs or list(itertools.combinations(names, 2))
    print(f"\n{label}: min CAM02-UCS distance per vision type")
    for k in KINDS:
        worst = min(pairs, key=lambda p: dist(group[p[0]], group[p[1]], k))
        print(f"  {k:14s} {dist(group[worst[0]], group[worst[1]], k):5.1f}  ({worst[0]} vs {worst[1]})")


provs = ["westhaven", "ridgeland", "goldplain", "lakemoor", "valcourt", "saltmarch", "northreach"]
fills = {p: var(f"prov-{p}") for p in provs}
strong = {p: var(f"prov-{p}-strong") for p in provs}
adj = [("westhaven", "ridgeland"), ("westhaven", "northreach"), ("ridgeland", "goldplain"),
       ("ridgeland", "northreach"), ("goldplain", "northreach"), ("goldplain", "lakemoor"),
       ("lakemoor", "valcourt"), ("valcourt", "saltmarch")]

paper, ink, ink_soft, raised = var("paper"), var("ink"), var("ink-soft"), var("paper-raised")
print("Text contrast (WCAG AA needs 4.5 for body text, 3 for large text and icons)")
for n in ["ink", "ink-soft", "sea-ink", "status-good", "status-warn", "status-bad",
          "res-energy", "res-food", "res-materials", "res-money",
          "party-1-ink", "party-2-ink", "party-3-ink", "party-4-ink"] + [f"prov-{p}-strong" for p in provs]:
    c = var(n)
    print(f"  {n:22s} {c}  on paper {contrast(c, paper):4.1f}  on raised {contrast(c, raised):4.1f}"
          f"  white text on it {contrast('#FFFFFF', c):4.1f}")
print(f"  sea-ink on sea          {contrast(var('sea-ink'), var('sea')):4.1f}")
for p in provs:
    print(f"  ink on prov-{p:11s} {contrast(ink, fills[p]):4.1f}")
for i in range(1, 5):
    print(f"  party-{i}-on on party-{i}  {contrast(var(f'party-{i}-on'), var(f'party-{i}')):4.1f}")

separation(fills, adj, "Province fills, neighbours only")
separation(fills, None, "Province fills, all pairs")
separation(strong, None, "Province strong (chips, text)")
separation({f"party-{i}": var(f"party-{i}") for i in range(1, 5)}, None, "Parties")
separation({f"party-{i}-tint": var(f"party-{i}-tint") for i in range(1, 5)}, None, "Party map tints")
separation({n: var(f"res-{n}") for n in ["energy", "food", "materials", "money"]}, None, "Resources")
separation({n: var(f"status-{n}") for n in ["good", "warn", "bad"]}, None, "Status")
