# Studio image contract

Choose a top, trousers and shoes in the right wardrobe, optionally add sunglasses, then press the photo button. Change colour and stocked size in the left summary. Product/colour changes mark the previous result as outdated; size changes retain the photograph. Presets, history, save/share, enlargement, JPEG download and atomic outfit-to-cart remain available. Panels scroll internally; the workspace fits the viewport. All photo sizes preserve a 2:3 aspect ratio.

## Coverage and composition

| Slot | Product/colour choices |
|---|---:|
| Top | 15 |
| Trousers | 7 |
| Shoes | 6 |
| Sunglasses | 3, plus none |

There are 17 supported products and `15 x 7 x 6 x 4 = 2,520` combinations. The result combines 28 prepared clothing layers and three complete face variants wearing glasses. These are reusable components, not 2,520 separately generated full-body photographs.

Outerwear was removed from the studio at the user's request after the collar/neck combinations remained visually unacceptable. Bomber jackets, overshirts, puffers and blazers remain normal shop products. Their studio photographs are outside the workspace; coat masks and clipping code were removed. Presets, legacy drafts and old five-piece links discard the retired slot while retaining the last eyewear entry. Restoring a modified saved outfit clears its saved identity so sharing cannot send the old coat outfit.

The fixed young fictional model retains the same camera, face, front view and lighting. Eyewear uses a complete photograph of his face wearing each frame; separate lenses are never pasted onto his face. Its silhouette is masked by the reference model's original alpha to suppress background contamination. The reference neck's skin boundary excludes the original T-shirt from other collars.

`PhotoComposition.tsx` draws photographs in a 1024×1536 SVG coordinate system. `composition.ts` supplies the same affine matrices, silhouettes, neck blending and layer order to both the view and the Canvas2D JPEG exporter. The face is protected above y=244; garment coverage blends from y=244 to y=264. No WebGL or runtime generation is used.

`tools/assets/calibrate_studio_images.py` reads alpha landmarks and writes placement metadata and neck vector coordinates only. It registers 28 layers: neck y=244, visible palms x=326/695, fingertips y=860, waistband y=596, hems y=1319 and shoe floor y=1410. `STUDIO_REGISTRATION.json` records the measurements; `head-neck-outline.json` records the reference neck contour. Regenerate these when the prepared photographs change.

Stock size changes the purchasable variant, without body deformation. Generated garment proportions, folds and lighting can vary; registration and occlusion do not turn independent photos into a physical fitting simulation.

## Manifest

`frontend/public/studio-images/manifest.json` is the trusted version-2 local source; mode is `layers` or `looks`. Each image records `file`, `width`, `height` and `bytes`. Paths must stay beneath `/studio-images/`, with a WebP/PNG/JPEG extension and no traversal or remote URL. Dimensions are bounded to 1..4096, bytes to 4 MiB per image.

Optional placement requires `scale`, `x` and `y` and accepts `scale_y`. Scales must be finite numbers in 0.1..2; x/y in -1..1. Scale controls horizontal size; scale_y controls vertical size and defaults to scale. Offsets are fractions of the 1024×1536 frame. SVG/Canvas use `[scale, 0, 0, scale_y, x*1024, y*1536]`.

`model` records the reference plus its ID/name. `garments` maps unique sets, slots and catalogue colour codes to images. A product's compatible `studio_asset` selects its set. `looks` can instead provide exact complete photographs; that mode accepts no approximate fallback. Missing pieces/colours disable preview with an explanation. Django validates and caches the manifest by resolved path and modification time.

## Register and verify imagery

Generate a transparent 1024×1536 PNG using the fixed model/product references and consistent framing. Inspect it, then register and calibrate from the project root:

```powershell
backend/.venv/Scripts/python.exe tools/assets/register_studio_image.py oxford-shirt sky C:/path/transparent.png
backend/.venv/Scripts/python.exe tools/assets/calibrate_studio_images.py
```

Registration checks catalogue colour, dimensions and corner alpha, then re-encodes WebP without raster edits. Optional `--scale`, `--scale-y`, `--x`, `--y` provide manual placement; calibration supersedes body-layer placement. Eyewear face variants retain identity-scale registration and require the same full-body camera/pose as the reference.

With the local stack running, from `frontend/`:

```powershell
node scripts/inspect-studio-photos.mjs
npm run test
npm run test:e2e
```

The inspection script renders the actual component into sheets for 15 top choices, 42 trouser/shoe pairs, and four face states. It checks 60 top/head compositions preserve every face pixel above y=244, 16 clear-background samples, and all 2,520 plans for finite registration and a single protected head. Evidence is in ignored `.local-tools/screenshots/studio-without-outerwear/`. These checks validate composition invariants, not naturalness or physical fit. Earlier passing coat-mask tests did not establish a natural collar, which is why outerwear is now excluded.
