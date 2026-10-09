"""Register measured alpha landmarks; only metadata is changed, never image pixels."""

import json
from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend/public"
MANIFEST = PUBLIC / "studio-images/manifest.json"
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
records = []


def average_x(alpha, row, start, end):
    points = [x for x in range(start, end) if alpha.getpixel((x, row)) >= 128]
    if not points:
        raise ValueError(f"No registration points in row {row}/{start}..{end}")
    return sum(points) / len(points)


for garment in manifest["garments"]:
    slot = garment["slot"]
    if slot == "accessory":
        continue  # Full-frame face variants already share the reference registration.
    for color, meta in garment["colors"].items():
        alpha = (
            Image.open(PUBLIC / meta["file"].lstrip("/"))
            .convert("RGBA")
            .getchannel("A")
        )
        bounds = alpha.point(lambda value: 255 if value >= 128 else 0).getbbox()
        if not bounds:
            raise ValueError(f"Empty photograph: {garment['id']}/{color}")
        left, top, right, bottom = bounds
        anchors = {}
        if slot == "top":
            neck = median(
                min(y for y in range(top, bottom) if alpha.getpixel((x, y)) >= 128)
                for x in (480, 512, 544)
            )
            palm_row = round(bottom - (bottom - neck) * 0.12)
            palm_left = average_x(alpha, palm_row, 0, 480)
            palm_right = average_x(alpha, palm_row, 544, 1024)
            sx = (695 - 326) / (palm_right - palm_left)
            tx = 326 - palm_left * sx
            sy = (860 - 244) / (bottom - neck)
            ty = 244 - neck * sy
            anchors = {
                "source_neck": neck,
                "target_neck": 244,
                "source_palm_row": palm_row,
                "source_palms": [palm_left, palm_right],
                "target_palms_x": [326, 695],
                "target_fingertip_y": 860,
            }
        elif slot == "bottom":
            sx = 294 / (right - left)
            tx = 512 - (left + right) * sx / 2
            sy = (1319 - 596) / (bottom - top)
            ty = 596 - top * sy
            anchors = {"target_waist_y": 596, "target_hem_y": 1319, "target_width": 294}
        else:
            sx = sy = 340 / (right - left)
            tx = 512 - (left + right) * sx / 2
            ty = 1410 - bottom * sy
            anchors = {"target_floor_y": 1410, "target_width": 340}
        placement = {
            "scale": round(sx, 9),
            "scale_y": round(sy, 9),
            "x": round(tx / 1024, 9),
            "y": round(ty / 1536, 9),
        }
        if not 0.1 <= sx <= 2 or not 0.1 <= sy <= 2:
            raise ValueError("Registration scale is outside the supported range")
        meta["placement"] = placement
        records.append(
            {
                "id": garment["id"],
                "color": color,
                "slot": slot,
                "source_alpha_bounds": bounds,
                "anchors": anchors,
                "placement": placement,
            }
        )

MANIFEST.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
)
(ROOT / "docs/STUDIO_REGISTRATION.json").write_text(
    json.dumps(
        {
            "frame": [1024, 1536],
            "coordinates": "source and target pixels; measured alpha landmarks",
            "records": records,
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)
print(f"Registered {len(records)} product/colour layers from measured landmarks.")
# Read the reference neck's skin boundary so its original white T-shirt cannot
# leak above a different collar. This writes vector coordinates, never pixels.
reference = Image.open(PUBLIC / manifest["model"]["file"].lstrip("/")).convert("RGBA")
neck_sides = [[], []]
for row in range(244, 291):
    points = []
    for x in range(430, 595):
        red, green, blue, alpha = reference.getpixel((x, row))
        if alpha >= 128 and red - blue >= 25 and red - green >= 12:
            points.append(x)
    if 512 not in points:
        raise ValueError(f"Reference neck landmark missing at row {row}")
    occupied = set(points)
    left = right = 512
    while left - 1 in occupied:
        left -= 1
    while right + 1 in occupied:
        right += 1
    neck_sides[0].append([left, row])
    neck_sides[1].append([right + 1, row])
(ROOT / "frontend/src/studio/head-neck-outline.json").write_text(
    json.dumps(neck_sides[0] + neck_sides[1][::-1], separators=(",", ":")),
    encoding="utf-8",
)
