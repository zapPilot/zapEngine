# 0001: Story as code

Accepted — 2026-10-07

## Context

Zap Pilot's landing, pitch, film and documentation explain one product through
different durations and interaction models. Product facts and capability status
were owned by the landing host, while video tests imported its files directly.
Copies of brand CSS and assets needed drift tests. Multiple products in this
monorepo need the same rendering mechanics without sharing product identity.

The supplied Landing v3 Motion and Promo Film + Deck design demonstrates the
boundary: both use an identical shared scene block; only the timeline driver
changes. We maintain that story and render cuts from it.

## Decisions

**D1 — Five owned layers.** Facts contain derived capability state, recorded
strategy decisions, pinned replay and source links. Beats own product copy and
claims. Scenes contain pure time models and thin renderers. Cuts select beats,
durations, settled stops and narration. Drivers/hosts own interaction and
platform concerns. We reject independent page, deck and film implementations
because they create multiple editorial and factual authorities.

**D2 — Separate engine and product packages.** `@zapengine/story-kit` owns
product-independent timeline mathematics, kinetic type, cuts/arcs, hold maps and
React drivers. `@zapengine/zap-pilot-story` owns Zap Pilot's facts, copy, models,
scenes and cuts. We reject a Zap-specific general engine and product facts inside
application hosts. React is isolated behind a kit subpath; the root entry stays
pure. Runtime-specific packages are deliberate exceptions to framework-neutral
shared packages.

**D3 — Every scene is a pure function of story time.** Scroll, deck stops, clock,
Remotion frames and stills supply time to the same model. Film has story time,
output clock time and ambient time. We reject frame-specific alternate scenes
and CSS clocks for exported animation. Narration can hold settled story instants
without rewriting scenes: total film duration is at most 60 seconds and one hold
adds at most 3.5 seconds. Web pitch retains the original 48-second cut.

**D4 — Derive and pin facts.** Shared capability and contract data lives in the
product package. Replay is generated from `99426e898`, including SHA-256 hashes
of its equity curve and strategy snapshot. Daily refreshes keep their rolling
landing files. We reject hardcoded display numbers, design arrays as factual
sources and changing a film whenever the rolling backtest updates. Writers and
readers move together. Regeneration checks compare exact pinned bytes.

**D5 — Bind claims to capability IDs; communicate status with shape.** Counts,
status labels and solid/wireframe treatment derive from `CAPABILITIES`. Typed
claims make incompatible status changes fail compilation. The design-token
status grammar owns filled, half, center-dot and dashed-ring glyphs plus solid or
dashed rails. We reject hand-authored liveness prose and color-only status.
Backtest disclosures include assumed yield and the modeled S&P sleeve; device
key and pre-sign simulation boundaries remain explicit.

**D6 — Keep hosts thin.** Landing owns routes, deployment, measurement and form
collection; video owns noninteractive film, stills, OG images and deck PDF.
Sales registry records deliverables; media-release fingerprints detect stale
outputs after a story change. We reject app-to-app data imports and independent
pitch copy. The new inline form preserves the existing
`landing-waitlist-cta-v2` assignment and POST contract. No experiment-key change
is included.

**D7 — Use container units for scene geometry.** Fixed stages declare a design
canvas and derive `--sk-px` from container width. Web and film select their world
unit through CSS. We reject JS viewport measurement as an authoritative layout
source, allowing SSR, no-JS, print and Remotion to share markup.

**D8 — Tokens v3 is one complete migration.** Paper/night roles, sleeves,
materials, native font instances and status primitives live in design-tokens.
Hosts may map these roles into platform APIs but may not retain v2 aliases.
We reject a compatibility theme that indefinitely preserves legacy colors and
radii. Web and Remotion share locally bundled Archivo/Martian variable fonts;
native and Satori use static instances. Font loading fails closed for film.

**D9 — Brand geometry is data.** The 32-unit dial mark lives in `tokens.mark` and
is the source for app, desktop and web assets. We reject separate copied SVG
geometries. The user can reject the mark replacement by changing that canonical
data; store icons update at their next submission.

## Non-goals

- No change to authoritative strategy or transaction planning.
- No promise of early access, returns or full Python/EVM parity.
- No KOKODE scene rewrite in this migration.
- No new checkout, branch, commit or publishing operation.
- No paid Fish model or music generation to bypass an unavailable free service.

## Consequences

Story edits require regeneration of affected media and fingerprints. Shared
scene CSS must obey the token contract, and cuts must pass stop-order,
settled-window and narrative-arc checks. Pixel inspection remains necessary for
3D scenes and native font metrics even when logic coverage is complete.

Final deck PDFs use 14 rendered JPEG stills composed into HTML and printed with
the existing Playwright runtime, with an invisible text layer and CTA links.
We reject Satori for 3D/width-axis fidelity and direct printing of live 3D DOM for
final publication. Browser print remains a convenient deck preview.

Narration listening, human acceptance of drive-112 and PDF inspection remain
explicit release gates. A render must fail closed until the music is accepted.

## Action items

- Complete the token/consumer migration, shared scenes and host integrations;
  verify the entire flow before declaring the redesign delivered.
- Register film, OG and deck outputs with fingerprints and the sales registry.
- Migrate KOKODE's groups, cuts, arc checks and deck navigation to story-kit in a
  subsequent change. Its vanilla TypeScript host keeps ownership of its views.
- Preserve KOKODE's existing motion constants and caption structure; compare
  stills pixel-for-pixel when shared video primitives change.
- Leave the unreferenced app brand cover image for an explicit owner decision.
