# Region editing

The brush stays local. `region-edit.js` reads the encoded source and alpha selection at equal dimensions, derives coordinates, and crops a small selection with context when appropriate. Large/disconnected selections keep the full input frame. The prompt describes the actual submitted input dimensions and relative selection coordinates.

`provider.js` sends one input image plus the coordinate prompt for region jobs; it sends no remote `mask` or identity references. Deletion rules do not require preserving the identity of an object being deleted. Both image-edit and image-returning chat protocols can be used.

On return, the browser checks aspect ratio and blends the image only through the original brush support. Feathering is clipped inside that support, including holes and disconnected regions. The original canvas RGBA bytes outside that support are copied unchanged. This protects decoded pixels, not compressed file bytes or metadata. Transparent holes, unchanged results, mismatched dimensions and cancellation do not create a new history version. The model's semantic correctness inside the selection still needs visual review.

## Checks

Run `npm test` and `npm run build` (no dependencies required).

The Node tests cover request fields, coordinate offsets after cropping, disconnected brush regions, inside-only blending, transparency, cancellation, history preservation, migration, copy and palette edits.

The browser integration harness uses a fresh disposable preview origin/profile. Build, then copy `tests/browser-region.html` to `dist/qa-region.html` and visit `/qa-region.html`. It seeds a synthetic source only if preview history is empty, mocks the provider inside an iframe, and exposes a verification button. Paint a region in the embedded editor, submit, then verify. No actual API request is made. Rebuild before publication to remove this temporary page from dist.

Observed browser integration: 1,535 selected pixels changed; zero unselected pixels changed; original and edited versions both persisted. All 23 Node tests passed.

Earlier live synthetic experiments with the configured gateway/model: coordinate + directional/scoped instructions passed 8/8 semantic checks; crop + edit + local composition passed 6/6 simple geometry checks. These are small synthetic samples, not production success rates for real portraits. No live generation runs automatically with the test suite.
