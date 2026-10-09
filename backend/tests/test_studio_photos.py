"""Photo manifests fail closed; local catalogue assets are complete and bounded."""

import copy
import json
from pathlib import Path

import pytest

from apps.catalog import studio


def valid_manifest():
    image = {"file": "/studio-images/tee/ivory.webp", "bytes": 100, "width": 1024, "height": 1536}
    return {
        "version": 2,
        "mode": "layers",
        "model": {**image, "file": "/studio-images/model-reference.webp"},
        "garments": [{"id": "tee", "slot": "top", "origin": "generated", "colors": {"ivory": image}}],
        "looks": [],
    }


@pytest.mark.parametrize(
    "bad",
    [
        {"file": "https://external.example/photo.png"},
        {"file": "/studio-images/../private.png"},
        {"file": "/studio-images/model.glb"},
        {"bytes": 0},
        {"bytes": studio.MAX_IMAGE_BYTES + 1},
        {"width": 10000},
        {"placement": {"scale": float("nan"), "x": 0, "y": 0}},
        {"placement": {"scale": -1, "x": 0, "y": 0}},
        {"placement": {"scale": 1, "x": 3, "y": 0}},
        {"placement": {"scale": 1, "scale_y": float("nan"), "x": 0, "y": 0}},
        {"placement": {"scale": 1, "scale_y": 0, "x": 0, "y": 0}},
        {"placement": {"scale": 1, "scale_y": True, "x": 0, "y": 0}},
    ],
)
def test_invalid_image_rejected(bad):
    manifest = valid_manifest()
    manifest["model"].update(bad)
    with pytest.raises(ValueError):
        studio._validate(manifest)


def test_duplicate_and_wrong_slot_rejected():
    manifest = valid_manifest()
    manifest["garments"].append(copy.deepcopy(manifest["garments"][0]))
    with pytest.raises(ValueError):
        studio._validate(manifest)
    manifest["garments"].pop()
    manifest["garments"][0]["slot"] = "none"
    with pytest.raises(ValueError):
        studio._validate(manifest)


def test_manifest_cache_uses_path_and_mtime(tmp_path, settings):
    paths = [tmp_path / "first.json", tmp_path / "second.json"]
    first = valid_manifest()
    second = valid_manifest()
    second["garments"][0]["id"] = "another-tee"
    for path, data in zip(paths, [first, second], strict=True):
        path.write_text(json.dumps(data), encoding="utf-8")
    settings.STUDIO_MANIFEST_PATH = paths[0]
    assert studio.is_supported("top", "tee")
    assert not studio.is_supported("shoes", "tee")
    settings.STUDIO_MANIFEST_PATH = paths[1]
    assert studio.is_supported("top", "another-tee")
    assert not studio.is_supported("top", "tee")
    paths[1].write_text("{}", encoding="utf-8")
    assert studio.load_manifest() is None
    settings.STUDIO_MANIFEST_PATH = tmp_path / "missing.json"
    assert studio.load_manifest() is None


def test_supported_demo_colors_have_local_photos_and_outerwear_is_retired(settings):
    manifest = studio.load_manifest()
    assert manifest is not None and manifest["mode"] == "layers"
    public = Path(settings.BASE_DIR).parent / "frontend/public"
    catalog = json.loads((Path(settings.BASE_DIR) / "fixtures/seed/catalog.json").read_text(encoding="utf-8"))
    assets = {g["id"]: g for g in manifest["garments"]}
    photo_count = 0
    for product in catalog["products"]:
        if product["studio_slot"] == "outerwear":
            assert product["studio_asset"] not in assets
            assert not studio.is_supported("outerwear", product["studio_asset"])
            continue
        asset = assets[product["studio_asset"]]
        assert asset["slot"] == product["studio_slot"]
        assert set(asset["colors"]) == {c["code"] for c in product["colors"]}
        for image in asset["colors"].values():
            file = public / image["file"].lstrip("/")
            assert file.is_file() and file.stat().st_size == image["bytes"]
            photo_count += 1
    assert photo_count == 31
