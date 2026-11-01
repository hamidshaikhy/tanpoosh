# Homepage styling table

The approved desktop composition is implemented in `StyleHero` and
`CategoryDisplay`. Text, links, buttons, hotspots and category labels are live
HTML; the photographs contain no baked-in UI. The homepage hero and the five
category cutouts are generated illustrations of the demo catalog.

The hero has three manually selected outfits: navy/sand, ivory/charcoal, and an
ivory T-shirt with indigo jeans. Each photograph has a matching public-catalog
outfit. Product hotspots link to the selected product and color. The main button
passes those same selections into the existing studio with `encodeOutfit`.
Unavailable product/color registrations are excluded. If the studio catalog
cannot be loaded, the default photograph and a generic studio entry remain.

A new image is decoded before selection changes. Failed loads retain the last
complete outfit and allow retry; stale requests cannot overwrite a newer choice.
The controls use native buttons and honor reduced motion. On mobile, the copy
and artwork stack, and categories become a native horizontal scrolling list.
The header remains within a 320px viewport; account access is available through
the mobile menu at narrow sizes.

Existing administrator-written hero copy is retained. Only the previous seeded
title, subtitle and button wording are translated to the new default design.
The old seeded collection link becomes the general clothing link; custom links
retain their destination.

## Images and provenance

The built-in `image_gen` tool produced three independent photographic
backgrounds and one transparent category strip from the approved mockup.
Exact prompts are saved in [HOME_IMAGE_PROMPTS.json](HOME_IMAGE_PROMPTS.json).
Final assets are in `frontend/public/editorial/home/`: `hero-navy.webp`,
`hero-ivory.webp`, `hero-weekend.webp`, and five files under `categories/`.
The three hero images total 416,648 bytes. Category images total 181,990 bytes.
Only the active hero image is loaded initially; alternative looks are requested
when selected, and categories use lazy loading.

`frontend/scripts/prepare-home-assets.mjs` accepts the four generated source
images, encodes WebP at quality 91, splits the transparent strip at the gaps
between products, and writes intrinsic sizes/background colors to
`hero-assets.json`. This processing contains no online generation request and
requires no API key. Run from `frontend/`:

```text
node scripts/prepare-home-assets.mjs <navy.png> <ivory.png> <weekend.png> <categories.png>
```

## Verification and screenshots

With the local store running, from `frontend/`:

```text
node scripts/check-home-style.mjs
node scripts/capture-home-readme.mjs
npm run typecheck
npm test
npm run build
```

The focused browser check covers look changes, failure/retry, matching studio
selection, category navigation, mobile, keyboard access and reduced motion.
The capture script updates real screenshots in `docs/screenshots` without
administrator credentials. Existing storefront, rack and studio behavior remains
connected to the same API and cart.
