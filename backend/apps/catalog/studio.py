"""Trusted repository manifest for the studio's pre-generated photographs."""

from __future__ import annotations

import json
import logging
import math
import re
from pathlib import Path
from typing import Any

from django.conf import settings

logger = logging.getLogger("tanpoosh.studio")
VALID_SLOTS = {"top", "outerwear", "bottom", "shoes", "accessory"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024
_cache: dict[str, Any] = {"key": None, "data": None}


def _image(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("image must be an object")
    file = value.get("file", "")
    if not isinstance(file, str) or not re.fullmatch(r"/studio-images/[a-z0-9_/-]+\.(webp|png|jpg)", file) or ".." in file:
        raise ValueError("invalid studio image path")
    if not 0 < int(value.get("bytes", 0)) <= MAX_IMAGE_BYTES:
        raise ValueError("image exceeds size budget or is empty")
    if not 0 < int(value.get("width", 0)) <= 4096 or not 0 < int(value.get("height", 0)) <= 4096:
        raise ValueError("invalid image dimensions")
    if "placement" in value:
        placement = value["placement"]
        if (
            not isinstance(placement, dict)
            or not {"scale", "x", "y"} <= set(placement)
            or set(placement) - {"scale", "scale_y", "x", "y"}
        ):
            raise ValueError("invalid layer placement")
        for key, bounds in {"scale": (0.1, 2), "scale_y": (0.1, 2), "x": (-1, 1), "y": (-1, 1)}.items():
            if key == "scale_y" and key not in placement:
                continue
            number = placement[key]
            if (
                isinstance(number, bool)
                or not isinstance(number, (float, int))
                or not math.isfinite(number)
                or not bounds[0] <= number <= bounds[1]
            ):
                raise ValueError("invalid layer placement")


def _validate(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get("version") != 2 or data.get("mode") not in {"layers", "looks"}:
        raise ValueError("unsupported photograph manifest")
    _image(data.get("model"))
    garments = data.get("garments")
    if not isinstance(garments, list):
        raise ValueError("image sets must be a list")
    seen = set()
    for garment in garments:
        if not isinstance(garment, dict):
            raise ValueError("image set must be an object")
        gid = garment.get("id")
        if not isinstance(gid, str) or not re.fullmatch(r"[a-z0-9-]{1,64}", gid) or gid in seen:
            raise ValueError("invalid or duplicate image set id")
        seen.add(gid)
        if garment.get("slot") not in VALID_SLOTS or not garment.get("origin"):
            raise ValueError(f"invalid image set {gid}")
        colors = garment.get("colors")
        if not isinstance(colors, dict):
            raise ValueError("colors must map to photographs")
        for color, image in colors.items():
            if not re.fullmatch(r"[a-z0-9-]{1,32}", color):
                raise ValueError("invalid color code")
            _image(image)
    looks = data.get("looks", [])
    if not isinstance(looks, list):
        raise ValueError("looks must be a list")
    for look in looks:
        if not isinstance(look, dict):
            raise ValueError("look must be an object")
        _image(look.get("image"))
        selections = look.get("selections")
        if not isinstance(selections, dict) or set(selections) - VALID_SLOTS:
            raise ValueError("invalid look selections")
        for slot, selection in selections.items():
            if not isinstance(selection, dict):
                raise ValueError("selection must be an object")
            garment = next((g for g in garments if g["id"] == selection.get("slug") and g["slot"] == slot), None)
            if not garment or selection.get("color") not in garment["colors"]:
                raise ValueError("look references an unknown product/color")
    return data


def load_manifest() -> dict[str, Any] | None:
    path = Path(settings.STUDIO_MANIFEST_PATH)
    try:
        key = (str(path.resolve()), path.stat().st_mtime_ns)
    except OSError:
        return None
    if _cache["key"] == key:
        return _cache["data"]
    try:
        data = _validate(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError, AttributeError, json.JSONDecodeError) as exc:
        logger.error("Studio photograph manifest invalid: %s", exc)
        data = None
    _cache.update(key=key, data=data)
    return data


def image_set_ids_by_slot() -> dict[str, str]:
    manifest = load_manifest()
    return {g["id"]: g["slot"] for g in (manifest or {}).get("garments", []) if g["colors"]}


def is_supported(studio_slot: str, studio_asset: str) -> bool:
    return bool(studio_asset) and image_set_ids_by_slot().get(studio_asset) == studio_slot
