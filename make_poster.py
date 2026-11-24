"""
Pac-Man AR - poster generator.

Draws an original Pac-Man-themed poster designed for reliable image tracking:
lots of high-contrast corners, no big flat areas, no symmetric/repeating layout.

Run from the PacManAR folder:
    python tools/make_poster.py

Outputs:
    assets/images/poster_print_A3.png   3508 x 4961 px (A3 portrait @ 300 DPI) -> print this
    assets/targets/poster_target.jpg    1000 px wide copy -> compiled into poster.mind
    assets/images/poster_preview.jpg    small preview
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 3508, 4961            # A3 portrait, 300 DPI
SEED = 1980                  # fixed seed -> same poster every run
rng = random.Random(SEED)

FONT_DIR = r"C:\Windows\Fonts"
def font(name, size):
    try:
        return ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    except OSError:
        return ImageFont.load_default(size)

YELLOW = (255, 216, 0)
BLUE_WALL = (33, 33, 255)
NAVY = (4, 4, 26)
GHOSTS = {
    "BLINKY": (255, 0, 0),
    "PINKY": (255, 184, 255),
    "INKY": (0, 255, 255),
    "CLYDE": (255, 184, 82),
}

# Pac-Man / portal placement (slightly off-centre on purpose: asymmetry helps tracking)
PAC_C = (int(W * 0.50), int(H * 0.53))
PAC_R = 560
PORTAL_R = 1000


def glow_layer(draw_fn, blur=25, strength=2):
    """Draw something on a transparent layer, blur it, and return a glow image."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    glow = layer.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _ in range(strength):
        out = Image.alpha_composite(out, glow)
    return Image.alpha_composite(out, layer)


# ---------------------------------------------------------------- background
def background():
    img = Image.new("RGBA", (W, H), NAVY + (255,))
    d = ImageDraw.Draw(img)
    # vertical gradient
    for y in range(0, H, 4):
        t = y / H
        c = (int(4 + 18 * t), int(4 + 4 * t), int(26 + 40 * (1 - abs(t - 0.5) * 2)))
        d.rectangle([0, y, W, y + 4], fill=c + (255,))
    # starfield: random sizes / colours -> many unique feature points
    for _ in range(1400):
        x, y = rng.randrange(W), rng.randrange(H)
        r = rng.choice([2, 3, 3, 4, 5, 7, 9])
        col = rng.choice([(255, 255, 255), (180, 200, 255), (255, 230, 150), (255, 150, 220), (150, 255, 255)])
        a = rng.randint(90, 255)
        if r >= 7 and rng.random() < 0.5:   # little 4-point sparkles
            d.line([x - r * 3, y, x + r * 3, y], fill=col + (a,), width=3)
            d.line([x, y - r * 3, x, y + r * 3], fill=col + (a,), width=3)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (a,))
    return img


# ---------------------------------------------------------------- maze
def maze_cells(cols, rows):
    """Random depth-first maze -> set of open passages between cells."""
    visited, passages = set(), set()
    stack = [(rng.randrange(cols), rng.randrange(rows))]
    visited.add(stack[0])
    while stack:
        cx, cy = stack[-1]
        nbrs = [(cx + dx, cy + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= cx + dx < cols and 0 <= cy + dy < rows and (cx + dx, cy + dy) not in visited]
        if not nbrs:
            stack.pop()
            continue
        n = rng.choice(nbrs)
        passages.add(frozenset([(cx, cy), n]))
        visited.add(n)
        stack.append(n)
    # knock out extra walls so it looks like an arcade maze (loops), not a puzzle maze
    for _ in range(cols * rows // 3):
        a = (rng.randrange(cols), rng.randrange(rows))
        dx, dy = rng.choice(((1, 0), (0, 1)))
        b = (a[0] + dx, a[1] + dy)
        if b[0] < cols and b[1] < rows:
            passages.add(frozenset([a, b]))
    return passages


def draw_maze(img):
    cols, rows = 11, 15
    mx, my = 140, 900                    # maze area (below the title)
    mw, mh = W - 2 * mx, H - my - 520
    cw, ch = mw / cols, mh / rows
    passages = maze_cells(cols, rows)

    walls = []
    for cx in range(cols):
        for cy in range(rows):
            x0, y0 = mx + cx * cw, my + cy * ch
            if frozenset([(cx, cy), (cx + 1, cy)]) not in passages and cx + 1 < cols:
                walls.append((x0 + cw, y0, x0 + cw, y0 + ch))
            if frozenset([(cx, cy), (cx, cy + 1)]) not in passages and cy + 1 < rows:
                walls.append((x0, y0 + ch, x0 + cw, y0 + ch))
    walls += [(mx, my, mx + mw, my), (mx, my + mh, mx + mw, my + mh),
              (mx, my, mx, my + mh), (mx + mw, my, mx + mw, my + mh)]

    def inside_portal(x, y, pad=0):
        return math.hypot(x - PAC_C[0], y - PAC_C[1]) < PORTAL_R + pad

    def draw_walls(d):
        for (x0, y0, x1, y1) in walls:
            # skip walls that would run through the portal
            if inside_portal((x0 + x1) / 2, (y0 + y1) / 2, 60):
                continue
            d.line([x0, y0, x1, y1], fill=BLUE_WALL + (255,), width=22, joint="curve")
            d.ellipse([x0 - 11, y0 - 11, x0 + 11, y0 + 11], fill=BLUE_WALL + (255,))
            d.ellipse([x1 - 11, y1 - 11, x1 + 11, y1 + 11], fill=BLUE_WALL + (255,))
        for (x0, y0, x1, y1) in walls:   # thin dark core -> classic double-line look
            if inside_portal((x0 + x1) / 2, (y0 + y1) / 2, 60):
                continue
            d.line([x0, y0, x1, y1], fill=(10, 10, 60, 255), width=7)

    img = Image.alpha_composite(img, glow_layer(draw_walls, blur=18, strength=2))

    # pellets in corridor centres (randomly skipped so there is no regular grid)
    d = ImageDraw.Draw(img)
    power_cells = {(0, 0), (cols - 1, 1), (1, rows - 1), (cols - 2, rows - 2)}
    for cx in range(cols):
        for cy in range(rows):
            px, py = mx + (cx + 0.5) * cw, my + (cy + 0.5) * ch
            if inside_portal(px, py, 80):
                continue
            if (cx, cy) in power_cells:
                r = 46
                d.ellipse([px - r, py - r, px + r, py + r], fill=(255, 200, 160, 255))
            elif rng.random() < 0.72:
                r = rng.choice([12, 14, 16])
                d.rectangle([px - r, py - r, px + r, py + r], fill=(255, 190, 170, 255))
    return img


# ---------------------------------------------------------------- characters
def draw_portal(img):
    def rings(d):
        cx, cy = PAC_C
        for i, (r, col, w) in enumerate([(PORTAL_R, (0, 255, 255), 30), (PORTAL_R - 70, (255, 0, 200), 18),
                                         (PORTAL_R - 120, (255, 216, 0), 10)]):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col + (255,), width=w)
        # broken tick marks around the ring (irregular spacing)
        a = 0
        while a < 360:
            rad = math.radians(a)
            r0, r1 = PORTAL_R + 40, PORTAL_R + rng.choice([80, 110, 140])
            d.line([cx + r0 * math.cos(rad), cy + r0 * math.sin(rad),
                    cx + r1 * math.cos(rad), cy + r1 * math.sin(rad)], fill=(0, 255, 255, 220), width=10)
            a += rng.uniform(6, 19)
    img = Image.alpha_composite(img, glow_layer(rings, blur=30, strength=3))
    # dark swirl inside the portal so Pac-Man pops
    d = ImageDraw.Draw(img)
    cx, cy = PAC_C
    for k in range(18):
        r = PORTAL_R - 140 - k * 45
        if r <= 0:
            break
        col = (10 + k * 3, 0 + k * 2, 40 + k * 6, 255)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    # spiral arms
    for arm in range(5):
        pts = []
        for t in range(0, 90):
            ang = arm * 72 + t * 6
            r = 60 + t * 9.5
            pts.append((cx + r * math.cos(math.radians(ang)), cy + r * math.sin(math.radians(ang))))
        d.line(pts, fill=(80, 40, 180, 255), width=14)
    return img


def draw_pacman(img):
    cx, cy = PAC_C
    r = PAC_R
    def body(d):
        d.pieslice([cx - r, cy - r, cx + r, cy + r], start=35, end=325, fill=YELLOW + (255,))
    img = Image.alpha_composite(img, glow_layer(body, blur=40, strength=2))
    d = ImageDraw.Draw(img)
    # highlight
    d.ellipse([cx - 320, cy - 420, cx - 160, cy - 300], fill=(255, 250, 200, 255))
    # eye
    ex, ey = cx + 40, cy - 300
    d.ellipse([ex - 55, ey - 70, ex + 55, ey + 70], fill=(20, 20, 20, 255))
    d.ellipse([ex - 15, ey - 50, ex + 15, ey - 15], fill=(255, 255, 255, 255))
    # motion lines behind him
    for i, dy in enumerate([-250, -60, 140, 330]):
        x0 = cx - r - 120 - i * 25
        d.line([x0 - 260, cy + dy, x0, cy + dy], fill=(255, 216, 0, 200), width=24)
    # a few pellets flying into his mouth
    for i, (dx, dy, pr) in enumerate([(r + 120, -10, 34), (r + 300, 40, 28), (r + 460, -30, 24)]):
        d.ellipse([cx + dx - pr, cy + dy - pr, cx + dx + pr, cy + dy + pr], fill=(255, 200, 160, 255))
    return img


def ghost_shape(d, cx, cy, s, col, look):
    """Dome top, straight sides, wavy bottom, two eyes looking in direction `look` (dx, dy)."""
    top, bottom = cy - s, cy + s * 0.95
    d.pieslice([cx - s, top, cx + s, top + 2 * s], start=180, end=360, fill=col)
    d.rectangle([cx - s, top + s, cx + s, bottom - s * 0.25], fill=col)
    # wavy skirt: 4 bumps
    bumps = 4
    bw = 2 * s / bumps
    for i in range(bumps):
        x0 = cx - s + i * bw
        d.pieslice([x0, bottom - s * 0.5, x0 + bw, bottom], start=0, end=180, fill=col)
        d.rectangle([x0, bottom - s * 0.5, x0 + bw, bottom - s * 0.25], fill=col)
    # eyes
    for ex in (cx - s * 0.38, cx + s * 0.38):
        ey = cy - s * 0.15
        d.ellipse([ex - s * 0.25, ey - s * 0.32, ex + s * 0.25, ey + s * 0.32], fill=(255, 255, 255, 255))
        px, py = ex + look[0] * s * 0.1, ey + look[1] * s * 0.13
        d.ellipse([px - s * 0.13, py - s * 0.13, px + s * 0.13, py + s * 0.13], fill=(30, 50, 220, 255))


def draw_ghosts(img):
    # Asymmetric placement around the portal, each a different size and tilt.
    placements = [
        ("BLINKY", (int(W * 0.19), int(H * 0.30)), 300, -12),
        ("PINKY", (int(W * 0.83), int(H * 0.36)), 260, 9),
        ("INKY", (int(W * 0.15), int(H * 0.74)), 280, 6),
        ("CLYDE", (int(W * 0.80), int(H * 0.77)), 320, -8),
    ]
    label_font = font("impact.ttf", 120)
    for name, (gx, gy), s, tilt in placements:
        col = GHOSTS[name] + (255,)
        look = ((PAC_C[0] - gx) / W * 4, (PAC_C[1] - gy) / H * 4)
        look = (max(-1, min(1, look[0])), max(-1, min(1, look[1])))
        size = int(s * 2.6)
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ghost_shape(ImageDraw.Draw(layer), size // 2, size // 2, s, col, look)
        layer = layer.rotate(tilt, resample=Image.BICUBIC)
        glow = layer.filter(ImageFilter.GaussianBlur(30))
        img.alpha_composite(glow, (gx - size // 2, gy - size // 2))
        img.alpha_composite(layer, (gx - size // 2, gy - size // 2))
        d = ImageDraw.Draw(img)
        tw = d.textlength(name, font=label_font)
        d.text((gx - tw / 2, gy + s * 1.15), name, font=label_font, fill=col,
               stroke_width=8, stroke_fill=(0, 0, 0, 255))
    return img


# ---------------------------------------------------------------- text / HUD
def draw_text(img):
    d = ImageDraw.Draw(img)
    title_f = font("impact.ttf", 560)
    sub_f = font("ariblk.ttf", 150)
    hud_f = font("consolab.ttf", 110)
    small_f = font("consolab.ttf", 80)

    # HUD row
    d.text((170, 60), "1UP", font=hud_f, fill=(255, 255, 255, 255))
    d.text((170, 170), "00", font=hud_f, fill=(255, 255, 255, 255))
    hs = "HIGH SCORE"
    d.text(((W - d.textlength(hs, font=hud_f)) / 2, 60), hs, font=hud_f, fill=(255, 255, 255, 255))
    d.text(((W - d.textlength("12450", font=hud_f)) / 2, 170), "12450", font=hud_f, fill=(255, 255, 255, 255))
    d.text((W - 170 - d.textlength("2UP", font=hud_f), 60), "2UP", font=hud_f, fill=(255, 255, 255, 255))

    # Title with thick blue outline + glow
    title = "PAC-MAN"
    tw = d.textlength(title, font=title_f)
    def t(dd):
        dd.text(((W - tw) / 2, 230), title, font=title_f, fill=YELLOW + (255,),
                stroke_width=30, stroke_fill=BLUE_WALL + (255,))
    img = Image.alpha_composite(img, glow_layer(t, blur=35, strength=2))
    d = ImageDraw.Draw(img)

    sub = "ESCAPE FROM THE POSTER"
    sw = d.textlength(sub, font=sub_f)
    # subtitle bar overlaps the maze top edge on purpose (more corners)
    d.rounded_rectangle([(W - sw) / 2 - 60, 840, (W + sw) / 2 + 60, 1040], radius=40,
                        fill=(255, 0, 120, 255), outline=(255, 255, 255, 255), width=10)
    d.text(((W - sw) / 2, 855), sub, font=sub_f, fill=(255, 255, 255, 255))

    # bottom strip: lives, level, fruit, call to action
    by = H - 470
    for i in range(3):   # lives (mini Pac-Men)
        x = 200 + i * 170
        d.pieslice([x, by + 40, x + 130, by + 170], start=215, end=145, fill=YELLOW + (255,))
    cta = "SCAN ME WITH YOUR PHONE"
    cw = d.textlength(cta, font=sub_f)
    d.text(((W - cw) / 2 + 120, by + 230), cta, font=sub_f, fill=(0, 255, 255, 255),
           stroke_width=6, stroke_fill=(0, 0, 0, 255))
    d.text((W - 900, by + 60), "LEVEL 01", font=hud_f, fill=(255, 255, 255, 255))
    # cherries
    fx, fy = W - 330, by + 90
    d.line([fx + 40, fy, fx + 110, fy - 110], fill=(140, 80, 30, 255), width=14)
    d.line([fx + 150, fy + 20, fx + 110, fy - 110], fill=(140, 80, 30, 255), width=14)
    d.ellipse([fx - 20, fy - 10, fx + 90, fy + 100], fill=(230, 0, 0, 255))
    d.ellipse([fx + 100, fy + 10, fx + 210, fy + 120], fill=(230, 0, 0, 255))
    d.ellipse([fx + 10, fy + 10, fx + 35, fy + 35], fill=(255, 255, 255, 255))
    # "AR" badge (unique shape in a corner)
    bx, by2 = 260, by + 260
    d.regular_polygon((bx, by2 + 60, 120), n_sides=6, rotation=rng.randint(0, 50),
                      fill=(255, 216, 0, 255), outline=(0, 0, 0, 255))
    d.text((bx - 70, by2 + 5), "AR", font=font("impact.ttf", 110), fill=(0, 0, 0, 255))
    return img


def main():
    img = background()
    img = draw_maze(img)
    img = draw_portal(img)
    img = draw_ghosts(img)
    img = draw_pacman(img)
    img = draw_text(img)
    rgb = img.convert("RGB")

    out_print = os.path.join(ROOT, "assets", "images", "poster_print_A3.png")
    out_target = os.path.join(ROOT, "assets", "targets", "poster_target.jpg")
    out_preview = os.path.join(ROOT, "assets", "images", "poster_preview.jpg")
    rgb.save(out_print, dpi=(300, 300))
    rgb.resize((1000, int(1000 * H / W)), Image.LANCZOS).save(out_target, quality=92)
    rgb.resize((700, int(700 * H / W)), Image.LANCZOS).save(out_preview, quality=85)
    print("Saved:\n ", out_print, "\n ", out_target, "\n ", out_preview)


if __name__ == "__main__":
    main()
