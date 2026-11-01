# TANPOOSH rack

The homepage has a scoped, lightweight garment preview linking to `/rack`.
The route uses the real Django public product details and the existing session,
CSRF, variant IDs, query cache, and cart drawer. No separate demo cart is created.

Eight products are registered in `src/rack/catalog.ts`. Prices and available sizes
are loaded from Django, never hard-coded. Missing products are omitted. A new
product requires a registered asset and a matching product/color pair.

`src/rack/engine.ts` renders Three.js garment surfaces, wooden hangers, a metal
rail, a shadow catcher, raycast selection, pointer drag, wheel navigation, spring
settling, and product-angle inspection. Grabbing a garment deforms its mesh around
the actual raycast contact point, pins the collar, and uses damped springs on
release. Spacing accounts for garment widths, viewing angles and hanger widths;
constraints are also resolved during transitions to prevent overlap. Rendering stops when settled or covered
by a dialog and pauses in hidden tabs. Native buttons provide alternatives to
gestures. Reduced motion is respected. Failed WebGL/asset loading falls back to
the registered product silhouettes with navigation and purchase intact.

The mesh surfaces are reconstructed from the existing front photographs, with
rounded thickness and a plain fabric-colored rear surface. They are not scanned
garment models and cannot reveal unphotographed construction or back details.
Both surfaces share their seam vertices. Conforming triangulation fills the
entire silhouette, so pulling the cloth cannot leave a disconnected outline
behind. The outline is smoothed and slightly inset in UV space to avoid sampling
the photographic background. `geometry.test.ts` checks closed edges, winding,
nondegenerate faces, volume and shared seams for all eight garments.
The source product photographs retain their dimensions and colors and are
encoded as high-quality WebP (92) for delivery, reducing image payload by 91%.
The registered textures and closed mesh snapshots are stored in `public/rack/`;
the vector outlines used by previews are stored in `src/rack/artwork.ts`.
No video frames or external shop's branding are used as product assets.

Validation: `npm run typecheck`, `npm test`, `npm run build` (separate build
directory while development is running), and `node scripts/check-rack.mjs`.
The latter checks the running local shop without reseeding accounts or fixtures.
`scripts/repair-rack-geometry.mjs` upgrades legacy garment meshes and regenerates
the matching lightweight vector outlines; already repaired meshes are preserved.

Run `node scripts/capture-rack-readme.mjs` from `frontend/` to refresh the desktop,
drag, product, cart, homepage-promotion and mobile screenshots in
`docs/screenshots/`. The script uses a fresh guest browser context and needs no
administrator credentials.

The application stays a local Next.js/Django project; no external Site was
created and nothing was published to a public host.
