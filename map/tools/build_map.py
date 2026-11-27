#!/usr/bin/env python3
"""Build borealis-map.svg.

Run from anywhere:  python3 map/tools/build_map.py
Needs: shapely (pip install --break-system-packages shapely)

How it works
- The land is one hand-placed control outline per landmass, roughened with
  seeded midpoint displacement so coasts look natural. Same seed, same map.
- Provinces come from a partition of the plane into "cells" built from shared
  border polylines (survey lines on projection parallels and meridians, rivers,
  a watershed). Each province = land AND its cell, so neighbours share
  identical border vertices. No gaps, no overlaps.
- Projection is a mock Lambert conic: parallels are arcs around a pole above
  the sheet, meridians are straight lines through that pole.
"""
import math
import os
import random

from shapely.geometry import (LineString, MultiLineString, MultiPolygon, Point,
                              Polygon, box)
from shapely.ops import unary_union
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, ".."))
W, H = 1600, 1000

# ---------------------------------------------------------------- palette
# Keep in sync with tokens.css (map/tokens.css is the source of truth).
C = {
    "paper": "#F4ECD8",
    "sea": "#D3E3E1",
    "sea_line": "#8DB1B3",
    "sea_ink": "#3C6670",
    "lake": "#C3DCDD",
    "river": "#4D86A0",
    "ink": "#2B2520",
    "ink_soft": "#5B5045",
    "neighbour": "#DEDAD0",
    "neighbour_ink": "#8C857A",
    "terrain": "#3A3128",
    "ice": "#F7F8F6",
}
PROV_FILL = {
    "westhaven": "#8FD0B2",
    "ridgeland": "#EDA77F",
    "goldplain": "#ECD47D",
    "lakemoor": "#D593A9",
    "valcourt": "#AE9FD6",
    "saltmarch": "#73C5C3",
    "northreach": "#E4E6F2",
}
PROV_NAME = {
    "westhaven": "Westhaven", "ridgeland": "Ridgeland", "goldplain": "Goldplain",
    "lakemoor": "Lakemoor", "valcourt": "Valcourt", "saltmarch": "Saltmarch",
    "northreach": "Northreach",
}

# ---------------------------------------------------------------- projection
PX, PY = 800.0, -6000.0  # pole


def par_y(y800, x):
    """y of the parallel that passes through (800, y800) at column x."""
    r = y800 - PY
    return PY + math.sqrt(r * r - (x - PX) ** 2)


def parallel(y800, x0, x1, step=10.0):
    n = max(1, int(abs(x1 - x0) / step))
    return [(x0 + (x1 - x0) * i / n, par_y(y800, x0 + (x1 - x0) * i / n)) for i in range(n + 1)]


def mer_x(xref, yref, y):
    return PX + (xref - PX) * (y - PY) / (yref - PY)


def meridian(xref, yref, y0, y1, step=10.0):
    n = max(1, int(abs(y1 - y0) / step))
    return [(mer_x(xref, yref, y0 + (y1 - y0) * i / n), y0 + (y1 - y0) * i / n) for i in range(n + 1)]


def par_mer(y800, xref, yref):
    """Intersection of a parallel and a meridian."""
    x = xref
    for _ in range(30):
        y = par_y(y800, x)
        x = mer_x(xref, yref, y)
    return (x, par_y(y800, x))


# ---------------------------------------------------------------- fractal tools
def _subdiv(a, b, rough, minlen, rng):
    d = math.dist(a, b)
    if d < minlen:
        return [a, b]
    nx, ny = -(b[1] - a[1]) / d, (b[0] - a[0]) / d
    off = max(-2.0, min(2.0, rng.gauss(0, 1))) * rough * d
    m = ((a[0] + b[0]) / 2 + nx * off, (a[1] + b[1]) / 2 + ny * off)
    left = _subdiv(a, m, rough, minlen, rng)
    right = _subdiv(m, b, rough, minlen, rng)
    return left + right[1:]


def fractal_line(pts, rough, minlen, seed):
    rng = random.Random(seed)
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        out += _subdiv(a, b, rough, minlen, rng)[1:]
    return out


def fractal_poly(pts, rough, minlen, seed):
    for attempt in range(40):
        ring = fractal_line(list(pts) + [pts[0]], rough, minlen, seed + attempt * 7919)[:-1]
        p = Polygon(ring)
        if p.is_valid:
            return p
    p = Polygon(ring).buffer(0)
    if isinstance(p, MultiPolygon):
        p = max(p.geoms, key=lambda g: g.area)
    return p


def chaikin(pts, n=2):
    for _ in range(n):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        out.append(pts[-1])
        pts = out
    return pts


def river_line(pts, seed, rough=0.13, minlen=4.0):
    return chaikin(fractal_line(pts, rough, minlen, seed), 2)


def blob(cx, cy, rx, ry, rot, n, rough, seed):
    rng = random.Random(seed)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        k = 1 + rng.uniform(-0.25, 0.25)
        x, y = rx * math.cos(t) * k, ry * math.sin(t) * k
        c, s = math.cos(rot), math.sin(rot)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return fractal_poly(pts, rough, max(1.2, min(rx, ry) / 2.5), seed)


# ---------------------------------------------------------------- southern border (49th analog)
S49 = 812.0  # parallel through (800, 812)
L60 = 430.0  # parallel through (800, 430)

# ---------------------------------------------------------------- rivers first (some are borders)
# Great Valcourt River: Lake Avenell outlet to the estuary head. Flows NE, downhill to the gulf.
R_VALCOURT = river_line([(1116, 836), (1126, 822), (1138, 806), (1150, 788), (1162, 770),
                         (1170, 752), (1180, 736), (1192, 722), (1210, 712)], seed=11, rough=0.08)
# Tamber River (border Lakemoor/Valcourt), flows SE from the shield into the Valcourt River.
_tamber_raw = river_line([(1072, 648), (1050, 664), (1030, 684), (1018, 700), (1034, 722),
                          (1060, 740), (1090, 756), (1120, 768), (1146, 776)], seed=12, rough=0.1)
# snap the mouth to the Valcourt River
_vr = LineString(R_VALCOURT)
_mouth = _vr.interpolate(_vr.project(Point(1155, 779)))
R_TAMBER = _tamber_raw[:-1] + [(_mouth.x, _mouth.y)]

# Border river between Saltmarch and the Southern Republic, flows ESE to Fundy analog
# Restigouche analog: border Valcourt / Saltmarch south of the gulf, flows NE into the Chaleur bay
R_RESTI = river_line([(1262, 762), (1270, 744), (1282, 728), (1296, 716), (1314, 704), (1330, 700)],
                     seed=14, rough=0.12)

# ---------------------------------------------------------------- partition lines
# Southern border, west to east. Junction vertices are exact and shared.
P_WR = (335.0, par_y(S49, 335.0))                  # Westhaven | Ridgeland on the border
P_RG = par_mer(S49, 530.0, 620.0)                  # Ridgeland | Goldplain
P_GL = par_mer(S49, 782.0, 700.0)                  # Goldplain | Lakemoor
# Cornwall analog: where the border leaves the Valcourt River
_ci = min(range(len(R_VALCOURT)), key=lambda i: abs(R_VALCOURT[i][1] - 815))
P_LV = R_VALCOURT[_ci]
S_EAST_Y800 = None


def _y800_for(x, y):
    # parallel through (x, y): find y800
    r = math.sqrt((x - PX) ** 2 + (y - PY) ** 2)
    return PY + r


S_EAST_Y800 = _y800_for(*P_LV)
P_VS = (1262.0, par_y(S_EAST_Y800, 1262.0))        # Valcourt | Saltmarch on the border
R_FUNDY = river_line([P_VS, (1282, 824), (1300, 826), (1318, 829),
                      (1336, 833), (1352, 840)], seed=13, rough=0.1)

S_lakes = river_line([(GLx, GLy) for GLx, GLy in [
    (P_GL[0], P_GL[1]), (789, 798), (802, 779), (830, 777), (860, 775), (890, 772), (915, 771),
    (928, 776), (938, 787), (946, 806), (952, 830), (957, 850), (962, 866), (966, 880), (990, 879),
    (1020, 876), (1046, 870), (1057, 866), (1059, 852), (1062, 842), (1086, 840), (1108, 836),
    (1116, 836)]], seed=21, rough=0.03)
S_lakes[0] = P_GL
S_lakes[-1] = R_VALCOURT[0]

S_LINE = (parallel(S49, -250, P_WR[0])[:-1] + [P_WR]
          + parallel(S49, P_WR[0], P_RG[0])[1:-1] + [P_RG]
          + parallel(S49, P_RG[0], P_GL[0])[1:-1] + [P_GL]
          + S_lakes[1:-1]
          + R_VALCOURT[:_ci + 1]
          + parallel(S_EAST_Y800, P_LV[0], P_VS[0])[1:-1] + [P_VS]
          + R_FUNDY[1:] + [(1400, 880), (1850, 960)])


def s_index(pt):
    return S_LINE.index(pt)


# 60th parallel analog
P_N_WR = par_mer(L60, 290.0, 600.0)
P_N_RG = par_mer(L60, 530.0, 620.0)
P_J = (1000.0, par_y(L60, 1000.0))
L60_LINE = (parallel(L60, -250, P_N_WR[0])[:-1] + [P_N_WR]
            + parallel(L60, P_N_WR[0], P_N_RG[0])[1:-1] + [P_N_RG]
            + parallel(L60, P_N_RG[0], P_J[0])[1:])
L60_LINE[-1] = P_J

# Westhaven | Ridgeland: continental divide (wiggly) then a meridian
DIVIDE = fractal_line([P_WR, (328, 776), (316, 744), (322, 712), (304, 682), (300, 652), (292, 622),
                       (290, 600)], rough=0.12, minlen=4, seed=31)
WR_LINE = DIVIDE + meridian(290, 600, 600, P_N_WR[1])[1:-1] + [P_N_WR]
# Ridgeland | Goldplain: meridian
RG_LINE = [P_RG] + meridian(530, 620, P_RG[1], P_N_RG[1])[1:-1] + [P_N_RG]
# Goldplain | Lakemoor: meridian then a straight line NE to the bay, then through bay water to J
GL_LINE = [P_GL] + meridian(782, 700, P_GL[1], 600)[1:] + [(892, 520), P_J]
# Lakemoor | Valcourt: short line north from the river, up the Tamber River, meridian north to the bay
_tamber_hit = min(range(len(R_TAMBER)), key=lambda i: math.dist(R_TAMBER[i], (P_LV[0], 776)))
_tamber_top = min(range(len(R_TAMBER)), key=lambda i: math.dist(R_TAMBER[i], (1018, 700)))
_lv_up = R_TAMBER[_tamber_top:_tamber_hit + 1][::-1]   # downstream point first, going upstream
_m_top = R_TAMBER[_tamber_top]
LV_LINE = ([P_LV] + _lv_up
           + meridian(_m_top[0], _m_top[1], _m_top[1], 560)[1:] + [(1010, 500), P_J])
# Northreach | Valcourt through Frost Bay and Kell Strait
NV_LINE = [P_J, (1000, 350), (1075, 282), (1318, 282)]
# Valcourt | Saltmarch north (Labrador): watershed, then a parallel to the Strait
_lab_y800 = _y800_for(1420, 598)
P_LAB = (1322.0, par_y(_lab_y800, 1322.0))
LAB_WATERSHED = fractal_line([(1318, 282), (1316, 326), (1304, 356), (1290, 384), (1282, 410),
                              (1296, 440), (1288, 470), (1304, 504), (1296, 540), (1310, 570),
                              P_LAB], rough=0.14, minlen=4, seed=41)
VS_N = LAB_WATERSHED + parallel(_lab_y800, P_LAB[0], 1420)[1:] + [(1436, 640), (1362, 690)]
# Valcourt | Saltmarch south: Chaleur bay water, the Restigouche analog upstream, then south
_resti_rev = R_RESTI[::-1]
VS_S = [(1362, 690)] + _resti_rev + meridian(1262, 762, 762, P_VS[1])[1:-1] + [P_VS]


def seg(line, a, b):
    i, j = line.index(a), line.index(b)
    return line[i:j + 1] if i <= j else line[j:i + 1][::-1]


BIG = 2000
cells = {}
# Northreach: everything north of the 60th line and of the bay/strait line
cells["northreach"] = Polygon([(-250, -300), (1850, -300), (1850, 282), (1318, 282)]
                              + NV_LINE[::-1][1:] + L60_LINE[::-1][1:] + [(-250, -300)])
cells["westhaven"] = Polygon(seg(L60_LINE, L60_LINE[0], P_N_WR) + WR_LINE[::-1][1:]
                             + seg(S_LINE, P_WR, S_LINE[0])[1:])
cells["ridgeland"] = Polygon(seg(L60_LINE, P_N_WR, P_N_RG) + RG_LINE[::-1][1:]
                             + seg(S_LINE, P_RG, P_WR)[1:] + DIVIDE[1:] + meridian(290, 600, 600, P_N_WR[1])[1:-1])
cells["goldplain"] = Polygon(seg(L60_LINE, P_N_RG, P_J) + GL_LINE[::-1][1:]
                             + seg(S_LINE, P_GL, P_RG)[1:] + RG_LINE[1:-1])
cells["lakemoor"] = Polygon(GL_LINE + LV_LINE[::-1][1:] + seg(S_LINE, P_LV, P_GL)[1:-1])
cells["valcourt"] = Polygon(LV_LINE + NV_LINE[1:] + VS_N[1:] + VS_S[1:]
                            + seg(S_LINE, P_VS, P_LV)[1:-1])
cells["saltmarch"] = Polygon(VS_N + VS_S[1:] + seg(S_LINE, P_VS, S_LINE[-1])[1:]
                             + [(1850, 282)])
cells["republic"] = Polygon(S_LINE + [(1850, 1300), (-250, 1300)])

# ---------------------------------------------------------------- land
MAIN = [
    # Southern Republic west coast, going north
    (150, 1012), (158, 968), (168, 924), (180, 880), (192, 840), (202, 808),
    # Westhaven coast with fjords
    (212, 788), (208, 766), (214, 748), (238, 738), (212, 728), (200, 706), (204, 684),
    (230, 668), (200, 660), (186, 640), (176, 616), (202, 600), (176, 592), (164, 572),
    (152, 546), (144, 520), (170, 506), (146, 496), (136, 474), (124, 450), (116, 426),
    (106, 400), (96, 374), (84, 348),
    # NW corner and the north coast, going east
    (78, 324), (96, 304), (118, 290), (134, 270), (160, 262), (178, 246), (204, 244),
    (228, 232), (256, 224), (280, 214), (306, 210), (326, 200), (338, 186), (352, 180),
    (366, 192), (382, 206), (404, 214), (420, 234), (446, 248), (470, 240), (484, 224),
    (492, 206), (508, 202), (516, 220), (530, 238), (548, 262), (572, 274), (596, 264),
    (612, 248), (624, 232), (640, 236), (652, 254), (664, 284), (678, 290), (686, 262),
    (696, 246), (714, 252), (732, 244), (748, 226), (762, 198), (774, 172), (790, 166),
    (802, 186), (798, 214), (808, 236), (822, 254), (842, 272),
    # Frost Bay, west shore going south (Thelon inlet)
    (836, 300), (826, 326), (814, 338), (794, 344), (788, 352), (806, 358), (806, 376),
    (800, 400), (792, 430), (790, 466), (796, 500),
    (808, 530), (828, 552),
    # south shore going east, James Bay analog lobe
    (860, 566), (898, 576), (934, 584), (950, 604), (958, 636), (976, 662), (1002, 672),
    (1026, 664), (1040, 640), (1044, 610), (1048, 580),
    # east shore going north
    (1050, 540), (1048, 504), (1054, 466), (1062, 428), (1058, 392), (1066, 352),
    (1082, 318), (1102, 298),
    # Kell Strait south shore going east, Ungava analog
    (1132, 300), (1162, 304), (1192, 310), (1220, 320), (1234, 348), (1252, 374),
    (1272, 370), (1284, 342), (1302, 330), (1322, 322), (1338, 338),
    # Atlantic (Labrador) coast going SE
    (1352, 366), (1372, 392), (1392, 420), (1410, 448), (1428, 480), (1444, 512),
    (1456, 542), (1450, 568), (1432, 590),
    # Gulf north shore going west to the estuary head
    (1406, 602), (1376, 608), (1346, 616), (1316, 626), (1290, 638), (1266, 652),
    (1242, 668), (1220, 684), (1204, 698), (1196, 708),
    # estuary south shore going NE, Gaspe analog
    (1206, 722), (1226, 714), (1250, 704), (1276, 692), (1302, 680), (1326, 670),
    (1344, 668), (1350, 680),
    # Chaleur analog, then NB and Nova Scotia analog
    (1330, 694), (1312, 702), (1316, 722), (1336, 734), (1356, 746), (1374, 758),
    (1392, 768), (1414, 772), (1438, 772), (1462, 768), (1486, 776), (1502, 790),
    (1492, 806), (1468, 818), (1442, 830), (1418, 842), (1396, 850), (1382, 852),
    # Fundy analog notch
    (1372, 840), (1360, 828), (1346, 824), (1334, 834), (1330, 852),
    # Southern Republic east coast going SW
    (1322, 874), (1310, 902), (1296, 932), (1286, 966), (1278, 1012),
]
mainland = fractal_poly(MAIN, rough=0.2, minlen=2.6, seed=101)
# the box below the sheet is land too (the Republic continues)
mainland = unary_union([mainland, Polygon([(150, 1012), (1278, 1012), (1278, 1100), (150, 1100)])])

ISLANDS = {
    # Westhaven
    "corran": ([(100, 676), (126, 684), (150, 702), (168, 724), (178, 752), (172, 768), (154, 762),
                (132, 744), (114, 720), (98, 696)], 0.16),
    "skerra": ([(40, 548), (58, 552), (68, 584), (64, 622), (52, 632), (42, 600)], 0.2),
    "skerra2": ([(54, 516), (66, 520), (68, 536), (58, 540)], 0.2),
    # Arctic
    "hallam": ([(470, 120), (520, 104), (566, 112), (590, 100), (628, 116), (634, 146), (612, 160),
                (624, 176), (592, 184), (560, 176), (530, 184), (500, 172), (480, 152)], 0.2),
    "northmost": ([(800, 30), (880, 22), (960, 30), (1012, 50), (992, 80), (942, 100), (882, 110),
                   (832, 100), (800, 70)], 0.2),
    "devra": ([(690, 88), (740, 80), (780, 96), (770, 120), (720, 128), (690, 114)], 0.2),
    "somar": ([(664, 152), (700, 146), (716, 166), (704, 192), (676, 192), (662, 172)], 0.2),
    "brisk": ([(872, 138), (930, 132), (952, 158), (924, 182), (884, 174)], 0.2),
    "tolland": ([(540, 66), (600, 56), (640, 72), (620, 98), (566, 102)], 0.22),
    "kell": ([(980, 150), (1030, 130), (1090, 124), (1150, 138), (1210, 162), (1262, 194),
              (1302, 224), (1312, 254), (1286, 266), (1240, 262), (1190, 258), (1140, 262),
              (1100, 268), (1060, 262), (1030, 248), (1000, 226), (976, 200), (966, 176)], 0.18),
    "southam": ([(898, 300), (940, 294), (966, 314), (952, 344), (910, 346), (892, 322)], 0.2),
    # Saltmarch
    "greyhold": ([(1468, 556), (1490, 546), (1504, 556), (1512, 574), (1528, 566), (1546, 576),
                  (1556, 598), (1574, 604), (1570, 622), (1556, 630), (1566, 648), (1556, 668),
                  (1536, 666), (1528, 684), (1506, 690), (1494, 676), (1478, 684), (1466, 670),
                  (1472, 650), (1460, 630), (1470, 612), (1460, 594), (1466, 576)], 0.17),
    "breton": ([(1510, 740), (1532, 736), (1550, 750), (1542, 770), (1520, 774), (1506, 760)], 0.2),
    "marram": ([(1376, 722), (1400, 716), (1428, 720), (1422, 732), (1392, 736), (1374, 734)], 0.16),
}
islands = [fractal_poly(p, rough=r, minlen=2.2, seed=200 + i) for i, (p, r) in enumerate(ISLANDS.values())]
land = unary_union([mainland] + islands)

# small islets on the ragged coasts
ISLET_KEEPOUT = [(1030, 74, 1330, 104), (1140, 270, 1240, 296), (1340, 628, 1466, 676), (810, 436, 1034, 470), (20, 14, 336, 182),
                 (1430, 120, 1570, 260)]


def add_islets(region, count, rmin, rmax, seed, near=22):
    global land
    rng = random.Random(seed)
    coast = land.boundary
    placed = []
    tries = 0
    while len(placed) < count and tries < count * 60:
        tries += 1
        x, y = rng.uniform(region[0], region[2]), rng.uniform(region[1], region[3])
        p = Point(x, y)
        r = rng.uniform(rmin, rmax)
        if land.buffer(r + 3.5).contains(p):
            continue
        if p.distance(coast) > near:
            continue
        if any(p.distance(q) < r + 4 for q in placed):
            continue
        if any(x0 - 8 <= x <= x1 + 8 and y0 - 8 <= y <= y1 + 8 for x0, y0, x1, y1 in ISLET_KEEPOUT):
            continue
        b = blob(x, y, r * rng.uniform(1.3, 2.6), r * 0.8, rng.uniform(0, math.pi), 9, 0.32, rng.randint(0, 10**6))
        placed.append(b)
    land = unary_union([land] + placed)


add_islets((30, 380, 140, 690), 16, 2.0, 5.0, 301)          # west coast
add_islets((470, 20, 1330, 300), 34, 2.5, 7.0, 302, near=40)  # arctic
add_islets((1340, 350, 1480, 600), 14, 2.0, 5.0, 303)        # Labrador coast
add_islets((1380, 560, 1590, 800), 14, 2.0, 5.0, 304)        # Atlantic
add_islets((850, 290, 1060, 580), 8, 2.0, 4.0, 305)          # Frost Bay


# ---------------------------------------------------------------- provinces
provinces = {}
for pid, cell in cells.items():
    g = land.intersection(cell)
    if isinstance(g, Polygon):
        parts = [g]
    else:
        parts = [q for q in getattr(g, "geoms", []) if isinstance(q, Polygon)]
    parts = [q for q in parts if q.area > 6]
    provinces[pid] = MultiPolygon(parts) if len(parts) > 1 else parts[0]

# ---------------------------------------------------------------- lakes
BIG_LAKES = {
    "halden": [(796, 776), (816, 762), (850, 756), (884, 754), (912, 758), (930, 768), (924, 782),
               (900, 788), (870, 794), (840, 798), (812, 796)],
    "ostrel": [(936, 784), (956, 780), (976, 790), (998, 800), (1004, 816), (990, 826), (984, 846),
               (972, 862), (954, 866), (944, 850), (940, 826), (934, 804)],
    "wren": [(900, 812), (916, 808), (924, 840), (920, 880), (906, 898), (896, 870), (895, 838)],
    "osier": [(962, 880), (980, 870), (1010, 866), (1040, 862), (1058, 864), (1060, 872), (1040, 880),
              (1010, 888), (980, 892), (964, 890)],
    "avenell": [(1050, 842), (1066, 832), (1090, 828), (1112, 830), (1120, 838), (1104, 846),
                (1078, 852), (1056, 852)],
    "greatslate": [(318, 398), (346, 384), (380, 382), (418, 388), (446, 396), (440, 408), (404, 406),
                   (372, 412), (342, 414), (322, 410)],
    "bearlake": [(392, 290), (420, 280), (446, 292), (440, 312), (414, 320), (404, 306), (388, 304)],
    "athen": [(452, 444), (478, 440), (500, 446), (494, 454), (466, 456)],
    "sedgewater": [(738, 572), (750, 566), (760, 590), (764, 630), (760, 668), (748, 690), (738, 672),
                   (742, 640), (734, 606)],
    "sedge2": [(712, 632), (722, 628), (726, 660), (716, 668), (710, 650)],
    "mistral": [(1150, 560), (1166, 548), (1176, 556), (1170, 576), (1156, 580)],
    "timber": [(1012, 688), (1022, 690), (1026, 708), (1016, 712)],
    "reservoir": [(1336, 562), (1356, 552), (1374, 562), (1360, 576), (1338, 576)],
}
lake_polys = {k: fractal_poly(v, rough=0.15, minlen=2.0, seed=400 + i) for i, (k, v) in enumerate(BIG_LAKES.items())}

# ---------------------------------------------------------------- other rivers
RIVERS = {}
RIVERS["valcourt"] = (R_VALCOURT, 2.6)
RIVERS["tamber"] = (R_TAMBER, 1.8)
RIVERS["fundy"] = (R_FUNDY, 1.2)
RIVERS["resti"] = (R_RESTI, 1.2)
# Westhaven: Corran River from the interior, south then west to the sea
RIVERS["corran"] = (river_line([(286, 470), (278, 520), (268, 572), (262, 620), (258, 668), (250, 712),
                                (236, 742), (218, 760), (194, 768)], seed=51), 1.7)
RIVERS["skeena"] = (river_line([(262, 440), (230, 470), (200, 492), (170, 508), (128, 512)], seed=52), 1.2)
# Sedge River: two branches from the Spine Mountains, east across the plains into Lake Sedgewater
_sedge_n = river_line([(330, 560), (380, 590), (430, 604), (480, 626), (530, 640), (584, 660),
                       (632, 680)], seed=53)
_sedge_s = river_line([(338, 720), (390, 730), (450, 724), (510, 716), (560, 720), (604, 704),
                       (632, 680)], seed=54)
_sedge_main = river_line([(632, 680), (668, 688), (702, 700), (726, 690), (748, 660)], seed=55)
RIVERS["sedge_n"] = (_sedge_n, 1.4)
RIVERS["sedge_s"] = (_sedge_s, 1.4)
_sedge_s[-1] = _sedge_n[-1]
_sedge_main[0] = _sedge_n[-1]
RIVERS["sedge"] = (_sedge_main, 1.9)
# Nelson analog: Lake Sedgewater outlet NE to Frost Bay
RIVERS["nelda"] = (river_line([(750, 580), (768, 560), (784, 546), (800, 536), (822, 518)],
                              seed=56), 1.9)
# Long River (Mackenzie analog): Greywater Lake NW to the Northern Sea, fed from the south
_long = river_line([(334, 398), (312, 360), (302, 326), (300, 290), (318, 254), (338, 220), (346, 176)],
                   seed=57)
RIVERS["long"] = (_long, 2.1)
_lr = LineString(_long)
_jn = _lr.interpolate(_lr.project(Point(302, 320)))
_peace = river_line([(296, 520), (330, 500), (372, 478), (420, 460), (462, 449)], seed=58)
RIVERS["peace"] = (_peace, 1.3)   # Rockies to Lake Athen
RIVERS["slave"] = (river_line([(476, 446), (462, 430), (444, 414), (424, 400)], seed=73), 1.3)  # Athen to Great Slate
_bear = river_line([(398, 300), (360, 306), (330, 312)], seed=59)
_bear[-1] = (_jn.x, _jn.y)
RIVERS["bear"] = (_bear, 1.1)
# Rivers into Frost Bay from Lakemoor and Valcourt, into the gulf and the Atlantic
RIVERS["strait1"] = (river_line([(924, 776), (942, 790)], seed=81, rough=0.05), 2.2)
RIVERS["strait2"] = (river_line([(916, 816), (938, 798)], seed=82, rough=0.05), 2.0)
RIVERS["strait3"] = (river_line([(958, 860), (962, 874)], seed=83, rough=0.05), 2.0)
RIVERS["strait4"] = (river_line([(1057, 868), (1058, 856), (1061, 846)], seed=84, rough=0.05), 2.0)
RIVERS["albin"] = (river_line([(1004, 744), (1000, 714), (996, 688), (990, 662), (988, 648)], seed=60), 1.3)
RIVERS["moss"] = (river_line([(860, 640), (870, 612), (880, 590), (888, 556)], seed=61), 1.1)
RIVERS["grande"] = (river_line([(1200, 470), (1150, 466), (1100, 460), (1036, 452)], seed=62), 1.4)
RIVERS["eastmain"] = (river_line([(1112, 584), (1082, 592), (1054, 596), (1030, 598)], seed=63), 1.1)
RIVERS["ungal"] = (river_line([(1222, 452), (1232, 420), (1244, 392), (1254, 352)], seed=64), 1.1)
RIVERS["churl"] = (river_line([(1370, 566), (1400, 562), (1428, 560), (1456, 556)], seed=65), 1.5)
RIVERS["sague"] = (river_line([(1160, 580), (1176, 620), (1196, 660), (1218, 700)], seed=66), 1.3)
RIVERS["lauren"] = (river_line([(1270, 560), (1272, 600), (1282, 652)], seed=67), 1.0)
RIVERS["yukar"] = (river_line([(232, 380), (196, 340), (160, 300), (104, 262)], seed=68), 1.2)
RIVERS["thelon"] = (river_line([(600, 410), (660, 396), (720, 380), (770, 362), (798, 350)], seed=70), 1.3)

all_lakes = unary_union(list(lake_polys.values()))


def clip_river(pts):
    """Keep the part of a river on land and outside lakes (it then meets the coast or a lake shore)."""
    ln = LineString(pts)
    ln = ln.intersection(land.buffer(0.01)).difference(all_lakes)
    return ln


# ---------------------------------------------------------------- shield lakes
SHIELD = Polygon([(392, 236), (820, 250), (860, 300), (1000, 260), (1320, 300), (1450, 500),
                  (1420, 598), (1300, 642), (1196, 704), (1140, 760), (1060, 792), (990, 760),
                  (900, 720), (820, 700), (770, 690), (700, 600), (640, 540), (560, 470), (470, 420),
                  (420, 380), (380, 330)])

# label / symbol keepouts, filled after labels are defined
KEEPOUT = []


def in_keepout(x, y, pad=0):
    for (x0, y0, x1, y1) in KEEPOUT:
        if x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad:
            return True
    return False


# ---------------------------------------------------------------- labels, places, anchors
CAPITALS = [
    # id, name, x, y, label dx, dy, anchor
    ("westhaven", "Port Corran", 214, 762, 12, -8, "start"),
    ("ridgeland", "Northgate", 448, 610, 0, -14, "middle"),
    ("goldplain", "Prairie Junction", 704, 702, -8, 20, "end"),
    ("lakemoor", "Port Vale", 1068, 822, -10, 0, "end"),
    ("valcourt", "Pontarel", 1166, 728, -10, -6, "end"),
    ("saltmarch", "Saltmarch Harbour", 1452, 812, 0, 24, "middle"),
    ("northreach", "Ironmere", 396, 376, 0, -12, "middle"),
]
FED = ("Corvell", 1088, 784)

PROV_LABELS = {
    # id: x, y, size, rotation
    "westhaven": (226, 600, 24, -66),
    "ridgeland": (420, 688, 26, 0),
    "goldplain": (634, 610, 25, 0),
    "lakemoor": (893, 700, 26, 0),
    "valcourt": (1176, 532, 30, 0),
    "saltmarch": (1370, 450, 22, 61),
    "northreach": (640, 330, 40, 0),
}
ANCHORS = {
    "westhaven": (284, 724),
    "ridgeland": (414, 760),
    "goldplain": (620, 760),
    "lakemoor": (850, 640),
    "valcourt": (1120, 640),
    "saltmarch": (1410, 800),
    "northreach": (520, 385),
}

SEA_LABELS = [
    # text, x, y, size, rot, spacing
    ("THE WESTERN SEA", 52, 846, 19, -90, 7),
    ("THE NORTHERN SEA", 1180, 96, 19, 0, 7),
    ("FROST BAY", 922, 462, 22, 0, 8),
    ("Gulf of", 1404, 650, 15, 0, 1.5),
    ("Valcourt", 1404, 668, 15, 0, 1.5),
    ("THE EASTERN SEA", 1450, 930, 19, 0, 5),
    ("Kell Strait", 1190, 286, 11, 0, 1),
]
FEATURE_LABELS = [
    # text, x, y, size, rot, color key, italic
    ("Spine Mountains", 330, 596, 12, -72, "ink_soft"),
    ("Coast Range", 166, 448, 11, -64, "ink_soft"),
    ("Valcourt River", 1206, 742, 11, -42, "river"),
    ("Sedge River", 470, 642, 11, 18, "river"),
    ("Long River", 292, 286, 11, -74, "river"),
    ("Tamber R.", 1074, 718, 10, 36, "river"),
    ("Greywater Lake", 384, 402, 10, 0, "river"),
    ("Lake Sedgewater", 776, 646, 10.5, -80, "river"),
    ("L. Halden", 860, 784, 10, 0, "river"),
    ("L. Osier", 1010, 878, 9.5, 0, "river"),
    ("Kell Island", 1150, 206, 12, 14, "ink_soft"),
    ("Greyhold Island", 1516, 624, 10.5, -64, "ink_soft"),
    ("Corran I.", 140, 726, 10, 56, "ink_soft"),
    ("Hallam Island", 566, 172, 11, 0, "ink_soft"),
    ("The Barrens", 560, 372, 12, 0, "ink_soft"),
    ("The Old Shield", 1150, 400, 12, 0, "ink_soft"),
]


def text_box(x, y, text, size, spacing, rot=0, anchor="middle"):
    w = len(text) * (size * 0.66 + spacing)
    h = size * 1.1
    if anchor == "middle":
        x0, x1 = x - w / 2, x + w / 2
    elif anchor == "start":
        x0, x1 = x, x + w
    else:
        x0, x1 = x - w, x
    if rot == 0:
        return (x0, y - h, x1, y + h * 0.3)
    # rotated: approximate by the bounding box of the rotated rectangle
    a = math.radians(rot)
    pts = []
    for (px, py) in [(x0, y - h), (x1, y - h), (x0, y + h * 0.3), (x1, y + h * 0.3)]:
        dx, dy = px - x, py - y
        pts.append((x + dx * math.cos(a) - dy * math.sin(a), y + dx * math.sin(a) + dy * math.cos(a)))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    if abs(math.sin(a)) > 0.5:
        # thin rotated band: use a coarse set of boxes along the text
        boxes = []
        n = 8
        for i in range(n + 1):
            t = i / n
            cx = x + ((x0 - x) + (x1 - x0) * t) * math.cos(a)
            cy = y + ((x0 - x) + (x1 - x0) * t) * math.sin(a)
            boxes.append((cx - h * 0.8, cy - h * 0.8, cx + h * 0.8, cy + h * 0.8))
        return boxes
    return (min(xs), min(ys), max(xs), max(ys))


def add_keepout(b):
    if isinstance(b, list):
        KEEPOUT.extend(b)
    else:
        KEEPOUT.append(b)


for pid, (x, y, s, rot) in PROV_LABELS.items():
    add_keepout(text_box(x, y, PROV_NAME[pid].upper(), s, s * 0.22, rot))
for (pid, name, x, y, dx, dy, anc) in CAPITALS:
    add_keepout((x - 9, y - 9, x + 9, y + 9))
    add_keepout(text_box(x + dx, y + dy + 5, name, 15, 0.5, 0, anc))
add_keepout((FED[1] - 13, FED[2] - 13, FED[1] + 13, FED[2] + 13))
add_keepout(text_box(FED[1] - 14, FED[2] + 4, "Capital District", 15, 0.5, 0, "end"))
for (t, x, y, s, rot, sp) in SEA_LABELS:
    add_keepout(text_box(x, y, t, s, sp, rot))
for (t, x, y, s, rot, ck) in FEATURE_LABELS:
    add_keepout(text_box(x, y, t, s, 0.5, rot))
for (x, y) in ANCHORS.values():
    add_keepout((x - 22, y - 22, x + 22, y + 22))

# seat blocks for Phase 2 election results: one square per riding, generated from game-data.json
import json
SEAT_BLOCKS = {
    # province: (x, y, columns)  top-left of the block
    "westhaven": (220, 440, 3),
    "ridgeland": (448, 500, 2),
    "goldplain": (612, 500, 3),
    "lakemoor": (878, 604, 4),
    "valcourt": (1178, 568, 4),
    "saltmarch": (1282, 744, 2),
    "northreach": (706, 388, 1),
}
SEAT = 17  # pitch
_gd = os.path.normpath(os.path.join(OUT_DIR, "..", "spec", "game-data.json"))
RIDINGS = json.load(open(_gd))["ridings"] if os.path.exists(_gd) else []

# ---------------------------------------------------------------- spatial helpers
border_lines = {
    "S": S_LINE, "L60": L60_LINE, "WR": WR_LINE, "RG": RG_LINE, "GL": GL_LINE, "LV": LV_LINE,
    "NV": NV_LINE, "VSN": VS_N, "VSS": VS_S,
}
borders_ml = unary_union([LineString(v) for v in border_lines.values()])
river_geoms = {k: clip_river(v[0]) for k, v in RIVERS.items()}
rivers_all = unary_union(list(river_geoms.values()))

land_inner = prep(land.buffer(-5))
near_border = prep(borders_ml.buffer(5))
near_river = prep(rivers_all.buffer(5))
near_lake = prep(all_lakes.buffer(4))
republic_p = prep(cells["republic"])

shield_lakes = []


def ok_spot(x, y, pad=0, check_border=True):
    p = Point(x, y)
    if not land_inner.contains(p):
        return False
    if republic_p.contains(p):
        return False
    if check_border and near_border.contains(p):
        return False
    if near_river.contains(p) or near_lake.contains(p):
        return False
    if in_keepout(x, y, pad):
        return False
    return True


rng = random.Random(777)
shield_p = prep(SHIELD)
tries = 0
while len(shield_lakes) < 260 and tries < 20000:
    tries += 1
    x, y = rng.uniform(380, 1460), rng.uniform(230, 800)
    if not shield_p.contains(Point(x, y)):
        continue
    if not ok_spot(x, y, pad=4):
        continue
    rx = rng.uniform(2.5, 9.5)
    ry = rx * rng.uniform(0.35, 0.7)
    b = blob(x, y, rx, ry, math.radians(rng.uniform(-50, -25)), 8, 0.28, rng.randint(0, 10**6))
    if b.buffer(3).intersects(all_lakes) or any(b.distance(o) < 3 for o in shield_lakes[-60:]):
        continue
    if not land.buffer(-3).contains(b):
        continue
    shield_lakes.append(b)
# a few lakes on the larger Arctic islands
while len(shield_lakes) < 290 and tries < 30000:
    tries += 1
    x, y = rng.uniform(480, 1310), rng.uniform(30, 270)
    if not ok_spot(x, y, pad=3, check_border=False):
        continue
    rx = rng.uniform(2, 5)
    b = blob(x, y, rx, rx * 0.55, math.radians(-30), 7, 0.25, rng.randint(0, 10**6))
    if land.buffer(-3).contains(b) and not any(b.distance(o) < 3 for o in shield_lakes):
        shield_lakes.append(b)

lakes_union = unary_union(list(lake_polys.values()) + shield_lakes)
near_lake = prep(lakes_union.buffer(3.5))

# ---------------------------------------------------------------- terrain symbols
TREELINE = LineString([(150, 250), (330, 214), (420, 262), (520, 322), (640, 382), (760, 430),
                       (800, 452), (1050, 400), (1150, 420), (1250, 446), (1340, 420), (1400, 452),
                       (1500, 470)])


def north_of_treeline(x, y):
    # find the treeline y at this x by interpolation
    pts = list(TREELINE.coords)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            ty = y0 + (y1 - y0) * (x - x0) / (x1 - x0)
            return y < ty
    return y < 300


def mountain(x, y, w, h):
    """Atlas hachure peak: two slopes plus shading strokes on the east (shadow) side."""
    d = f"M{x - w:.1f} {y:.1f}L{x:.1f} {y - h:.1f}L{x + w:.1f} {y:.1f}"
    lx, ly = -w, h
    L = math.hypot(lx, ly)
    ux, uy = lx / L, ly / L
    n = 3 if w > 5 else 2
    for k in range(n):
        t = (k + 1) / (n + 1.2)
        px, py = x + w * t, y - h + h * t
        ln = h * 0.55 * (1 - t * 0.55)
        d += f"M{px:.1f} {py:.1f}l{ux * ln:.1f} {uy * ln:.1f}"
    return d


def range_glyphs(spine, width, spacing, wmin, wmax, seed, region_check=None, hscale=1.0):
    rng = random.Random(seed)
    line = LineString(spine)
    out = []
    pts = []
    s = 0.0
    while s < line.length:
        for _ in range(int(width / 5) + 1):
            p = line.interpolate(s)
            q = line.interpolate(min(line.length, s + 1))
            dx, dy = q.x - p.x, q.y - p.y
            L = math.hypot(dx, dy) or 1
            nx, ny = -dy / L, dx / L
            off = rng.uniform(-width, width)
            x, y = p.x + nx * off + rng.uniform(-2, 2), p.y + ny * off + rng.uniform(-2, 2)
            core = 1 - abs(off) / width
            w = wmin + (wmax - wmin) * core * rng.uniform(0.6, 1.0)
            h = w * rng.uniform(1.0, 1.35) * hscale
            if any(math.hypot(x - a, y - b) < (w + c) * 0.95 for a, b, c in pts):
                continue
            if not ok_spot(x, y - h / 2, pad=3, check_border=False):
                continue
            if region_check and not region_check(x, y):
                continue
            pts.append((x, y, w))
        s += spacing
    pts.sort(key=lambda t: t[1])
    for x, y, w in pts:
        out.append(mountain(x, y, w, w * 1.25 * hscale))
    return out


mtn = []
mtn += range_glyphs([(338, 808), (326, 760), (316, 720), (304, 680), (296, 640), (290, 600), (282, 560),
                     (272, 520), (262, 480), (252, 440), (240, 400), (228, 360), (214, 320), (196, 286)],
                    width=30, spacing=7, wmin=4.5, wmax=12, seed=1)
mtn += range_glyphs([(206, 760), (196, 720), (184, 680), (172, 640), (160, 600), (148, 560), (138, 520),
                     (126, 480), (114, 440), (104, 400)], width=16, spacing=8, wmin=3.5, wmax=7, seed=2)
# Laurel Hills north of the Valcourt River
mtn += range_glyphs([(1120, 700), (1170, 680), (1220, 650), (1270, 620), (1320, 600)], width=14,
                    spacing=12, wmin=3, wmax=5, seed=3, hscale=0.7)
# Gaspe and the Saltmarch uplands
mtn += range_glyphs([(1236, 790), (1262, 770), (1290, 740), (1320, 690)], width=10, spacing=12, wmin=3,
                    wmax=5, seed=4, hscale=0.7)
# Torngat analog in north Saltmarch
mtn += range_glyphs([(1322, 344), (1340, 380), (1360, 414)], width=10, spacing=8, wmin=3, wmax=6, seed=5)
# Kell and Northmost island mountains (east sides)
mtn += range_glyphs([(1080, 140), (1150, 150), (1220, 178), (1280, 214)], width=12, spacing=9, wmin=3.5,
                    wmax=7, seed=6)
mtn += range_glyphs([(840, 50), (900, 42), (960, 50)], width=14, spacing=9, wmin=3.5, wmax=6.5, seed=7)
# Greyhold uplands
mtn += range_glyphs([(1500, 600), (1530, 640)], width=8, spacing=10, wmin=3, wmax=4.5, seed=8, hscale=0.7)

# forest, grass, tundra stipple on a jittered grid
trees_rain, trees_boreal, grass, tundra, fields = [], [], [], [], []
PRAIRIE = Polygon([(330, 806), (330, 650), (380, 620), (470, 640), (560, 650), (660, 640), (730, 600),
                   (760, 640), (770, 700), (790, 806)])
prairie_p = prep(PRAIRIE)
HEART = Polygon([(930, 800), (1000, 790), (1060, 800), (1120, 790), (1160, 760), (1200, 726),
                 (1240, 710), (1250, 730), (1200, 770), (1150, 810), (1060, 860), (980, 860)])
heart_p = prep(HEART)
wh_p = prep(cells["westhaven"])

rng = random.Random(99)
step = 11
for gx in range(30, 1580, step):
    for gy in range(20, 990, step):
        x, y = gx + rng.uniform(-4, 4), gy + rng.uniform(-4, 4)
        if not ok_spot(x, y, pad=3):
            continue
        if any(math.hypot(x - a, y - b) < 0 for a, b in []):
            continue
        P = Point(x, y)
        if north_of_treeline(x, y):
            if rng.random() < 0.42:
                tundra.append((x, y))
            continue
        if wh_p.contains(P):
            # rainforest west of the coast range, drier interior plateau east of it
            if x < 220 - (760 - y) * 0.25 + 40:
                if rng.random() < 0.85:
                    trees_rain.append((x, y))
            elif rng.random() < 0.18:
                trees_boreal.append((x, y))
            continue
        if prairie_p.contains(P):
            if rng.random() < 0.2:
                grass.append((x, y))
            continue
        if heart_p.contains(P):
            if rng.random() < 0.28:
                fields.append((x, y))
            continue
        if rng.random() < 0.3:
            trees_boreal.append((x, y))

# extra half-step rainforest density along the coast
for gx in range(90, 300, 6):
    for gy in range(380, 800, 6):
        x, y = gx + rng.uniform(-2, 2), gy + rng.uniform(-2, 2)
        if not wh_p.contains(Point(x, y)):
            continue
        if x < 196 - (760 - y) * 0.25 + 30 and ok_spot(x, y, pad=3) and rng.random() < 0.35:
            if all(math.hypot(x - a, y - b) > 5 for a, b in trees_rain[-40:]):
                trees_rain.append((x, y))


def tree(x, y, s):
    return f"M{x - 1.7 * s:.1f} {y + 1.2 * s:.1f}L{x:.1f} {y - 3.2 * s:.1f}L{x + 1.7 * s:.1f} {y + 1.2 * s:.1f}M{x:.1f} {y + 1.2 * s:.1f}v{1.6 * s:.1f}"


def tuft(x, y):
    return f"M{x - 2.4:.1f} {y:.1f}l0.8 -2.4M{x:.1f} {y:.1f}v-3M{x + 2.4:.1f} {y:.1f}l-0.8 -2.4"


def marsh(x, y):
    return f"M{x - 3.2:.1f} {y:.1f}h6.4M{x - 1.6:.1f} {y - 0.4:.1f}v-1.8M{x + 1.6:.1f} {y - 0.4:.1f}v-1.8M{x:.1f} {y - 0.4:.1f}v-2.6"


def field(x, y):
    return f"M{x - 3:.1f} {y:.1f}h6M{x - 2:.1f} {y + 2:.1f}h4"


# ice caps on the high Arctic islands
ice = []
for (cx, cy, rx, ry, sd) in [(900, 60, 46, 16, 1), (1110, 160, 30, 10, 2), (1200, 190, 22, 8, 3),
                              (735, 104, 18, 7, 4)]:
    b = blob(cx, cy, rx, ry, math.radians(8), 10, 0.25, 900 + sd).intersection(land.buffer(-4))
    if not b.is_empty:
        ice.append(b)

# ---------------------------------------------------------------- SVG writers
def ring_d(coords):
    c = list(coords)
    if c[0] == c[-1]:
        c = c[:-1]
    return "M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in c) + "Z"


def poly_d(g):
    if g.is_empty:
        return ""
    if isinstance(g, Polygon):
        geoms = [g]
    else:
        geoms = [q for q in g.geoms if isinstance(q, Polygon)]
    out = []
    for p in geoms:
        out.append(ring_d(p.exterior.coords))
        for r in p.interiors:
            out.append(ring_d(r.coords))
    return "".join(out)


def line_d(g):
    if g.is_empty:
        return ""
    if isinstance(g, LineString):
        geoms = [g]
    else:
        geoms = [q for q in getattr(g, "geoms", []) if isinstance(q, LineString)]
    return "".join("M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in q.coords) for q in geoms if len(q.coords) > 1)


# graticule
grat = []
for k in range(-3, 9):
    y800 = 430 + k * 127.333
    if y800 < -100 or y800 > 1150:
        continue
    pts = [p for p in parallel(y800, -40, 1640, 16)]
    grat.append("M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts))
for k in range(-7, 8):
    ang = math.radians(k * 4.0)  # meridians every 4 degrees of fan angle
    x0 = PX + math.tan(ang) * (-40 - PY)
    x1 = PX + math.tan(ang) * (1040 - PY)
    grat.append(f"M{x0:.1f},-40 {x1:.1f},1040")
grat_d = "".join(grat)

# water lines (concentric ripples offset from the coast)
coast_all = land
ripples = []
for d, op in [(4, 0.55), (8.5, 0.36), (14, 0.2)]:
    g = coast_all.buffer(d, quad_segs=4).simplify(1.0)
    bd = g.boundary
    ripples.append((line_d(bd), op))

neighbour = land.intersection(cells["republic"])

# borders split by type
province_ids = ["westhaven", "ridgeland", "goldplain", "lakemoor", "valcourt", "saltmarch", "northreach"]
land_sans_rep = land.difference(cells["republic"]).buffer(0.01)
national = LineString(S_LINE).intersection(land.buffer(0.01))
internal_lines = unary_union([LineString(v) for k, v in border_lines.items() if k != "S"])
internal = internal_lines.intersection(land.buffer(-0.01))

# capitals
cap_svg = []
for (pid, name, x, y, dx, dy, anc) in CAPITALS:
    cap_svg.append(f'<g class="bm-city" data-province="{pid}">'
                   f'<circle cx="{x}" cy="{y}" r="6.5" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="1.6"/>'
                   f'<circle cx="{x}" cy="{y}" r="3" fill="{C["ink"]}"/>'
                   f'<text x="{x + dx}" y="{y + dy + 5}" text-anchor="{anc}" class="bm-city-name">{name}</text></g>')


def star(cx, cy, r1, r2, n=5):
    pts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r2
        a = -math.pi / 2 + i * math.pi / n
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return "M" + " ".join(pts) + "Z"


fed_svg = (f'<g class="bm-city bm-federal" data-province="lakemoor" data-role="federal-capital">'
           f'<circle cx="{FED[1]}" cy="{FED[2]}" r="11" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="1.4"/>'
           f'<path d="{star(FED[1], FED[2], 9, 3.8)}" fill="{C["ink"]}"/>'
           f'<text x="{FED[1] - 15}" y="{FED[2] - 1}" text-anchor="end" class="bm-city-name bm-fed-name">{FED[0]}</text>'
           f'<text x="{FED[1] - 15}" y="{FED[2] + 11}" text-anchor="end" class="bm-fed-sub">Capital District</text></g>')


def prov_label(pid):
    x, y, s, rot = PROV_LABELS[pid]
    t = f' transform="rotate({rot} {x} {y})"' if rot else ""
    return (f'<text x="{x}" y="{y}" font-size="{s}" letter-spacing="{s * 0.22:.1f}" text-anchor="middle"'
            f' class="bm-prov-name" data-province="{pid}"{t}>{PROV_NAME[pid].upper()}</text>')


def sea_label(t, x, y, s, rot, sp):
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    return (f'<text x="{x}" y="{y}" font-size="{s}" letter-spacing="{sp}" text-anchor="middle"'
            f' class="bm-sea-name"{tr}>{t}</text>')


def feat_label(t, x, y, s, rot, ck):
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    return (f'<text x="{x}" y="{y}" font-size="{s}" text-anchor="middle" fill="{C[ck]}"'
            f' class="bm-feature-name"{tr}>{t}</text>')


# compass rose (NE sea) and cartouche (NW sea)
def compass(cx, cy, r):
    s = []
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 0.78:.1f}" fill="none" stroke="{C["ink"]}" stroke-width="0.8" opacity="0.7"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 0.70:.1f}" fill="none" stroke="{C["ink"]}" stroke-width="0.5" opacity="0.6"/>')
    for i in range(32):
        a = i * math.pi / 16
        r0 = r * 0.70
        r1 = r * (0.78 if i % 4 else 0.86)
        s.append(f'<path d="M{cx + r0 * math.sin(a):.1f} {cy - r0 * math.cos(a):.1f}L{cx + r1 * math.sin(a):.1f} {cy - r1 * math.cos(a):.1f}" stroke="{C["ink"]}" stroke-width="0.6" opacity="0.6"/>')
    for i, (ln, wd) in enumerate([(r, 0.17), (r * 0.62, 0.12)]):
        for k in range(4):
            a = k * math.pi / 2 + (math.pi / 4 if i else 0)
            tip = (cx + ln * math.sin(a), cy - ln * math.cos(a))
            l = (cx + wd * r * math.sin(a - math.pi / 2), cy - wd * r * math.cos(a - math.pi / 2))
            rr = (cx + wd * r * math.sin(a + math.pi / 2), cy - wd * r * math.cos(a + math.pi / 2))
            s.append(f'<path d="M{cx} {cy}L{l[0]:.1f} {l[1]:.1f}L{tip[0]:.1f} {tip[1]:.1f}Z" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="0.8"/>')
            s.append(f'<path d="M{cx} {cy}L{rr[0]:.1f} {rr[1]:.1f}L{tip[0]:.1f} {tip[1]:.1f}Z" fill="{C["ink"]}" stroke="{C["ink"]}" stroke-width="0.8"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="2.6" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="0.8"/>')
    s.append(f'<text x="{cx}" y="{cy - r - 6}" text-anchor="middle" class="bm-compass-n">N</text>')
    return "".join(s)


def cartouche(x, y, w, h):
    s = []
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="2"/>')
    s.append(f'<rect x="{x + 5}" y="{y + 5}" width="{w - 10}" height="{h - 10}" fill="none" stroke="{C["ink"]}" stroke-width="0.7"/>')
    # corner flourishes
    for (cx, cy, sx, sy) in [(x + 5, y + 5, 1, 1), (x + w - 5, y + 5, -1, 1), (x + 5, y + h - 5, 1, -1),
                             (x + w - 5, y + h - 5, -1, -1)]:
        s.append(f'<path d="M{cx} {cy + sy * 16}q{sx * 10} {-sy * 2} {sx * 16} {-sy * 16}" fill="none" stroke="{C["ink"]}" stroke-width="0.9"/>')
        s.append(f'<circle cx="{cx + sx * 5}" cy="{cy + sy * 5}" r="1.6" fill="{C["ink"]}"/>')
    mx = x + w / 2
    s.append(f'<text x="{mx}" y="{y + 30}" text-anchor="middle" class="bm-cart-kicker">THE FEDERATION OF</text>')
    s.append(f'<text x="{mx}" y="{y + 80}" text-anchor="middle" class="bm-cart-title">BOREALIS</text>')
    s.append(f'<path d="M{mx - 120} {y + 92}h96M{mx + 24} {y + 92}h96" stroke="{C["ink"]}" stroke-width="0.8"/>')
    s.append(f'<path d="{star(mx, y + 92, 6, 2.5, 4)}" fill="{C["ink"]}"/>')
    s.append(f'<text x="{mx}" y="{y + 113}" text-anchor="middle" class="bm-cart-sub">Seven Provinces from Sea to Sea</text>')
    # scale bar: 1 unit = 3.5 km, so 500 km = 142.9 units
    sx0, sy0 = mx - 72, y + 132
    u = 500 / 3.5 / 4
    for i in range(4):
        s.append(f'<rect x="{sx0 + i * u:.1f}" y="{sy0}" width="{u:.1f}" height="5" fill="{C["ink"] if i % 2 == 0 else C["paper"]}" stroke="{C["ink"]}" stroke-width="0.8"/>')
    for i, lab in [(0, "0"), (2, "250"), (4, "500 km")]:
        s.append(f'<text x="{sx0 + i * u:.1f}" y="{sy0 + 17}" text-anchor="middle" class="bm-scale">{lab}</text>')
    return "".join(s)


# ---------------------------------------------------------------- assemble
def build():
    out = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"'
               ' role="img" aria-labelledby="bm-title bm-desc" class="borealis-map">')
    out.append('<title id="bm-title">Map of Borealis</title>')
    out.append('<desc id="bm-desc">A fictional nation of seven provinces. Westhaven on the west coast, '
               'Ridgeland east of the mountains, Goldplain on the central prairie, Lakemoor on the great lakes, '
               'Valcourt along the river valley, Saltmarch on the Atlantic coast and islands, and Northreach '
               'across the whole north. The Southern Republic lies to the south.</desc>')
    out.append("""<style>
.borealis-map text{font-family:'Crimson Text','Crimson Pro',Georgia,'Times New Roman',serif}
.bm-prov{cursor:pointer;transition:fill .4s ease}
.bm-prov-name{font-weight:600;fill:#2B2520;paint-order:stroke;stroke:#F7F1E3;stroke-width:5px;stroke-opacity:.6;stroke-linejoin:round}
.bm-city-name{font-size:15px;font-weight:600;fill:#2B2520;paint-order:stroke;stroke:#F7F1E3;stroke-width:4px;stroke-opacity:.75;stroke-linejoin:round}
.bm-fed-sub{font-size:10.5px;font-style:italic;fill:#5B5045;paint-order:stroke;stroke:#F7F1E3;stroke-width:3.5px;stroke-opacity:.75}
.bm-sea-name{font-style:italic;fill:#3C6670}
.bm-feature-name{font-style:italic;paint-order:stroke;stroke:#F7F1E3;stroke-width:3px;stroke-opacity:.5}
.bm-neighbour-name{font-style:italic;fill:#8C857A;letter-spacing:9px}
.bm-cart-kicker{font-size:12px;letter-spacing:5px;fill:#2B2520}
.bm-cart-title{font-size:50px;font-weight:700;letter-spacing:12px;fill:#2B2520}
.bm-cart-sub{font-size:14px;font-style:italic;fill:#5B5045}
.bm-scale{font-size:10px;fill:#2B2520}
.bm-compass-n{font-size:18px;font-weight:700;fill:#2B2520}
</style>""")
    # defs: hatch patterns the app can use for redundant (non-colour) encoding of parties
    out.append('<defs>'
               '<pattern id="bm-hatch-1" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v10" stroke="#2B2520" stroke-width="1.6" opacity=".35"/></pattern>'
               '<pattern id="bm-hatch-2" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.6" fill="#2B2520" opacity=".35"/></pattern>'
               '<pattern id="bm-hatch-3" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 0v10M5 0v10" stroke="#2B2520" stroke-width="1" opacity=".3"/></pattern>'
               '<pattern id="bm-hatch-4" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 6h12" stroke="#2B2520" stroke-width="1.4" opacity=".3"/></pattern>'
               '</defs>')

    # ocean
    out.append('<g id="ocean" pointer-events="none">')
    out.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="{C["sea"]}"/>')
    for d, op in ripples[::-1]:
        out.append(f'<path d="{d}" fill="none" stroke="{C["sea_line"]}" stroke-width="0.9" opacity="{op}"/>')
    out.append('</g>')

    # neighbour
    out.append('<g id="neighbour" pointer-events="none">')
    out.append(f'<path id="southern-republic" d="{poly_d(neighbour)}" fill="{C["neighbour"]}"/>')
    out.append(f'<text x="640" y="930" text-anchor="middle" font-size="20" class="bm-neighbour-name">THE SOUTHERN REPUBLIC</text>')
    out.append('</g>')

    # provinces
    out.append('<g id="provinces">')
    for pid in province_ids:
        out.append(f'<path id="prov-{pid}" data-province="{pid}" class="bm-prov" fill="{PROV_FILL[pid]}"'
                   f' fill-rule="evenodd" d="{poly_d(provinces[pid])}"><title>{PROV_NAME[pid]}</title></path>')
    out.append('</g>')

    # terrain
    out.append(f'<g id="terrain" pointer-events="none" fill="none" stroke="{C["terrain"]}" stroke-linecap="round" stroke-linejoin="round">')
    out.append(f'<g id="terrain-ice">' + "".join(
        f'<path d="{poly_d(b)}" fill="{C["ice"]}" fill-opacity=".85" stroke="{C["sea_line"]}" stroke-width=".7" stroke-dasharray="2 2"/>'
        for b in ice) + '</g>')
    out.append(f'<path id="terrain-tundra" d="{"".join(marsh(x, y) for x, y in tundra)}" stroke-width="0.75" opacity="0.42"/>')
    out.append(f'<path id="terrain-grass" d="{"".join(tuft(x, y) for x, y in grass)}" stroke-width="0.8" opacity="0.4"/>')
    out.append(f'<path id="terrain-fields" d="{"".join(field(x, y) for x, y in fields)}" stroke-width="0.7" opacity="0.32"/>')
    out.append(f'<path id="terrain-forest" d="{"".join(tree(x, y, 1.0) for x, y in trees_boreal)}" stroke-width="0.8" opacity="0.42"/>')
    out.append(f'<path id="terrain-rainforest" d="{"".join(tree(x, y, 1.15) for x, y in trees_rain)}" stroke-width="0.9" opacity="0.6"/>')
    out.append(f'<path id="terrain-mountains" d="{"".join(mtn)}" stroke-width="1.2" opacity="0.88"/>')
    out.append('</g>')

    # lakes
    out.append(f'<g id="lakes" pointer-events="none">')
    out.append(f'<path id="lakes-great" d="{poly_d(unary_union(list(lake_polys.values())))}" fill="{C["lake"]}" stroke="{C["river"]}" stroke-width="0.9"/>')
    out.append(f'<path id="lakes-shield" d="{poly_d(unary_union(shield_lakes).simplify(0.35))}" fill="{C["lake"]}" stroke="{C["river"]}" stroke-width="0.6"/>')
    out.append('</g>')

    # rivers
    out.append(f'<g id="rivers" pointer-events="none" fill="none" stroke="{C["river"]}" stroke-linecap="round" stroke-linejoin="round">')
    for k, (pts, wdt) in RIVERS.items():
        out.append(f'<path data-river="{k}" d="{line_d(river_geoms[k].simplify(0.25))}" stroke-width="{wdt}"/>')
    out.append('</g>')

    # coast + borders
    out.append('<g id="borders" pointer-events="none" fill="none" stroke-linecap="round" stroke-linejoin="round">')
    out.append(f'<path id="coastline" d="{poly_d(land.simplify(0.3))}" stroke="{C["ink"]}" stroke-width="1.15"/>')
    out.append(f'<path id="border-provincial" d="{line_d(internal)}" stroke="{C["ink"]}" stroke-width="1.6" stroke-dasharray="7 3 1.5 3" opacity="0.85"/>')
    out.append(f'<path id="border-national-halo" d="{line_d(national)}" stroke="{C["paper"]}" stroke-width="5" opacity="0.7"/>')
    out.append(f'<path id="border-national" d="{line_d(national)}" stroke="{C["ink"]}" stroke-width="2.2" stroke-dasharray="10 3 2 3 2 3"/>')
    out.append('</g>')

    # graticule (very faint, over land too, atlas style)
    out.append(f'<g id="graticule" pointer-events="none"><path d="{grat_d}" fill="none" stroke="{C["sea_ink"]}" stroke-width="0.6" opacity="0.16"/></g>')

    # overlay: the app draws selection outlines and trade routes here
    out.append('<g id="overlay" pointer-events="none"></g>')

    # capitals
    out.append('<g id="capitals" pointer-events="none">' + "".join(cap_svg) + fed_svg + '</g>')

    # labels
    out.append('<g id="labels" pointer-events="none">')
    out.append('<g id="labels-provinces">' + "".join(prov_label(p) for p in province_ids) + '</g>')
    out.append('<g id="labels-seas">' + "".join(sea_label(*s) for s in SEA_LABELS) + '</g>')
    out.append('<g id="labels-features">' + "".join(feat_label(*f) for f in FEATURE_LABELS) + '</g>')
    out.append('</g>')

    # ridings (hidden until Phase 2; the app sets display and fills)
    rb = ['<g id="ridings" pointer-events="none" style="display:none">']
    for pid in province_ids:
        rs = [r for r in RIDINGS if r["province"] == pid]
        if not rs:
            continue
        x0, y0, cols = SEAT_BLOCKS[pid]
        rows = math.ceil(len(rs) / cols)
        w, h = min(cols, len(rs)) * SEAT + 5, rows * SEAT + 5
        rb.append(f'<g class="seat-block" data-province="{pid}">'
                  f'<rect x="{x0 - 2.5}" y="{y0 - 2.5}" width="{w}" height="{h}" rx="2" fill="{C["paper"]}" stroke="{C["ink"]}" stroke-width="1" opacity=".92"/>')
        for i, r in enumerate(rs):
            cx, cy = x0 + (i % cols) * SEAT, y0 + (i // cols) * SEAT
            rb.append(f'<rect class="seat" data-riding="{r["id"]}" data-province="{pid}" x="{cx + 1}" y="{cy + 1}" width="{SEAT - 3}" height="{SEAT - 3}" fill="#B8B1A4" stroke="{C["ink"]}" stroke-width=".6"><title>{r["name"]}</title></rect>')
        rb.append('</g>')
    rb.append('</g>')
    out.append("".join(rb))

    # anchors
    out.append('<g id="anchors" pointer-events="none">' + "".join(
        f'<circle class="anchor" data-province="{p}" cx="{x}" cy="{y}" r="0"/>' for p, (x, y) in ANCHORS.items()) + '</g>')

    # badges: the app draws approval badges and scarcity alerts here, at the anchors
    out.append('<g id="badges" pointer-events="none"></g>')

    # decoration
    out.append('<g id="decoration" pointer-events="none">')
    out.append(cartouche(26, 18, 300, 158))
    out.append(compass(1500, 190, 58))
    out.append(f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" fill="none" stroke="{C["ink"]}" stroke-width="2"/>')
    out.append(f'<rect x="7" y="7" width="{W - 14}" height="{H - 14}" fill="none" stroke="{C["ink"]}" stroke-width="0.6"/>')
    out.append('</g>')
    out.append('</svg>')
    return "\n".join(out)


def report():
    print("province areas and part counts:")
    for pid in province_ids:
        g = provinces[pid]
        n = 1 if isinstance(g, Polygon) else len(g.geoms)
        print(f"  {pid:11s} area={g.area:9.0f} parts={n}")
    # partition check
    names = list(provinces)
    worst = 0
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a = provinces[names[i]].intersection(provinces[names[j]]).area
            worst = max(worst, a)
    u = unary_union(list(provinces.values()) + [neighbour])
    print(f"  max pairwise overlap area = {worst:.4f}")
    print(f"  land not covered = {land.difference(u).area:.4f}")
    print(f"  shield lakes = {len(shield_lakes)}, mountains = {len(mtn)}, trees = {len(trees_boreal) + len(trees_rain)}")
    for k, (x, y) in ANCHORS.items():
        inside = provinces[k].contains(Point(x, y))
        print(f"  anchor {k}: inside={inside}")


if __name__ == "__main__":
    svg = build()
    path = os.path.join(OUT_DIR, "borealis-map.svg")
    with open(path, "w") as f:
        f.write(svg)
    report()
    print(f"wrote {path} ({len(svg) / 1024:.0f} KB)")
