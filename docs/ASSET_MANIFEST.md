# Asset manifest

| Asset | Source and treatment | Current use |
|---|---|---|
| `frontend/public/brand/*.svg` | Existing traced TANPOOSH artwork | Header/footer |
| Estedad WOFF2 | Self-hosted font; OFL retained in `frontend/src/fonts/Estedad-OFL.txt` | Persian UI |
| `backend/fixtures/seed/photoreal/*.png` | 39 generated product concepts | WebP product media imports |
| `frontend/public/editorial/hero-young.webp` | Previous generated editorial photo using the young model identity | Retained previous hero asset |
| `frontend/public/editorial/home/hero-*.webp` | Three generated overhead outfit photographs; built-in image_gen, quality-91 WebP | Homepage styling table and look selector |
| `frontend/public/editorial/home/categories/*.webp` | Five generated category cutouts split from a transparent strip | Homepage category display |
| `frontend/public/studio-images/model-reference.webp` | Generated young fictional male photograph | Initial studio photo, head silhouette and interactive homepage looks |
| `frontend/public/studio-images/*/*-layer.webp` | 28 generated transparent clothing layers, re-encoded to WebP | Top, trousers and shoes |
| `frontend/public/studio-images/*/*-head-v2.webp` | Three generated photographs with correctly worn eyewear | Complete face variants; reference alpha masks the silhouette |
| `frontend/public/studio-images/manifest.json` | Bounded version-2 metadata with independent x/y scales | 17 products, 31 colours, 2,520 combinations |
| `frontend/src/studio/head-neck-outline.json` | Measured vector geometry; source pixels unchanged | Reference neck clipping |

The studio directory contains 33 files totalling 3,793,584 bytes (about 3.62 MiB), including the manifest and reference. A preview loads only the reference and selected three to four photos. The active homepage hero is 151,376 bytes; all three hero variants plus the five category cutouts total 598,638 bytes. Generation prompts, processing and usage are documented in [HOME_STYLE.md](HOME_STYLE.md).

Images are generated visual assets. Product source PNGs and the final WebP studio assets are included in the repository. Images are fictional photographic concepts, not inventory photography. Independently generated pieces can differ in fine details and do not predict fit.

The SVG display and Canvas2D JPEG exporter share pixel-space registration and masks. No online generation service or API key is required. Only current studio assets are served. See [STUDIO_IMAGES.md](STUDIO_IMAGES.md) for composition details and adding imagery.
