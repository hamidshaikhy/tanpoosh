"""Register an AI-created photo layer without changing its content or coordinates."""

import argparse
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend/public/studio-images"

parser = argparse.ArgumentParser()
parser.add_argument("slug")
parser.add_argument("color")
parser.add_argument("source", type=Path)
parser.add_argument("--scale", type=float, default=1)
parser.add_argument("--scale-y", type=float)
parser.add_argument("--x", type=float, default=0)
parser.add_argument("--y", type=float, default=0)
args = parser.parse_args()
scale_y = args.scale if args.scale_y is None else args.scale_y
if not (
    math.isfinite(args.scale)
    and 0.1 <= args.scale <= 2
    and math.isfinite(scale_y)
    and 0.1 <= scale_y <= 2
    and math.isfinite(args.x)
    and -1 <= args.x <= 1
    and math.isfinite(args.y)
    and -1 <= args.y <= 1
):
    parser.error("Placement must be finite: scale/scale-y 0.1..2, x/y -1..1")
catalog = json.loads(
    (ROOT / "backend/fixtures/seed/catalog.json").read_text(encoding="utf-8")
)
product = next(p for p in catalog["products"] if p["slug"] == args.slug)
if args.color not in {c["code"] for c in product["colors"]}:
    raise ValueError("Unknown product color")
image = Image.open(args.source)
if image.size != (1024, 1536) or image.mode != "RGBA":
    raise ValueError(
        f"Expected a registered transparent 1024x1536 image, got {image.size}/{image.mode}"
    )
if image.getpixel((0, 0))[3] > 10 or image.getpixel((1023, 1535))[3] > 10:
    raise ValueError("Layer corners must be transparent")
out = PUBLIC / args.slug / f"{args.color}-layer.webp"
out.parent.mkdir(parents=True, exist_ok=True)
# WebP re-encoding preserves alpha and registration; no crops, recoloring or resizing.
image.save(out, "WEBP", quality=90, method=6)
manifest = json.loads((PUBLIC / "manifest.json").read_text(encoding="utf-8"))
asset = next(g for g in manifest["garments"] if g["id"] == args.slug)
asset["colors"][args.color] = {
    "file": f"/studio-images/{args.slug}/{args.color}-layer.webp",
    "width": image.width,
    "height": image.height,
    "bytes": out.stat().st_size,
    "placement": {"scale": args.scale, "scale_y": scale_y, "x": args.x, "y": args.y},
}
(PUBLIC / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"Registered {args.slug}/{args.color}: {out.stat().st_size:,} bytes")
