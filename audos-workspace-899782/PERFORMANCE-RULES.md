# Performance rules for this workspace

**Read this before writing or editing any UI in `apps/BeauHome/`.**

These are not style preferences. Each one was written after a measured
regression — a DevTools profile, a PageSpeed run or a production trace. Every
rule below has been broken at least once and cost real time to find again.

If a change conflicts with a rule here, say so rather than working around it.

---

## 1. Never resolve a product image on mount

`resolveProductImageCandidates()` costs up to **three network round-trips** per
call: an og:image fetch, an image search, then a web search to locate the
product page and read *its* og:image.

Components render in grids. Ungated, twenty cards fire sixty requests before
anyone scrolls — including cards below the fold and cards in tabs that stay
mounted under `display:none` after a single visit. A profile of this pattern
measured an **11.8 second Interaction to Next Paint** and a **16.9 second
frozen frame**.

**Do this:**

```tsx
import { useOnScreen } from './use-on-screen';

const [hostRef, onScreen] = useOnScreen<HTMLElement>();

useEffect(() => {
  const settled = peekProductImageCandidate(subject);   // free — always allowed
  if (settled || !onScreen) return;                     // ← the gate
  void resolveProductImageCandidates(subject).then(…);
}, [subjectKey, onScreen]);

return <div ref={hostRef}>…</div>;
```

`loading="lazy"` does **not** cover this. That defers the image *download*; it
does nothing about the effect that decides *which* image to download. The
effect needs its own gate.

Gated today: `hunt-cards.tsx`, `product-photo.tsx`, `canonical-garment.tsx`.

## 2. Garment tiles go through `CanonicalGarment`

Do not write `<img src={piece.photo_url}>` for a garment. `CanonicalGarment`
owns four things a raw tag misses:

- the stored transparent cutout, when one exists
- the on-screen gate for ingestion
- the live-image registry, with its staleness eviction
- the scoped `ethaion:garment-image-ready` subscription

A raw tag shows the **unprocessed photograph**, so none of the Photoroom
background removal reaches that screen.

## 3. `<img>` needs `loading="lazy"` unless it is above the fold

Exceptions, deliberately: the shell logo in `Desktop.tsx`, the brand mark on
`EmailGate.tsx` (near the LCP element — lazy makes the measured score worse),
and the just-picked photo in `add-piece.tsx`, which must appear instantly.

## 4. Events that repaint tiles must name what changed

`ethaion:garment-image-ready` carries `{ pieceId, source }`. Dispatch it via
`notifyGarmentImage()`, never as a bare event.

It used to carry no payload, so every mounted tile re-rendered on every image
event anywhere in the app — 60 re-renders per completed cutout in a 60-tile
grid, plus every tile in every previously-visited tab.

## 5. Polling must stop when the screen is not visible

Main tabs stay mounted under `display:none` once visited, so an unguarded
`setInterval` keeps reading the database for a screen nobody is looking at.

Use `useVisibleInterval` (`apps/YourStyle/App.tsx`) or check
`document.visibilityState` **and** `el.checkVisibility()` / `offsetParent`.

Prefer an event over a poll where the write happens in the browser. Polling is
justified only for server-side writes — Beau's `save_rubric` cannot dispatch a
browser event, which is why the Dossier polls at all.

## 6. `whenIdle` honours its timeout — do not "simplify" it

`requestIdleCallback` does not exist in Safari, and **every iOS browser is
WebKit underneath**. The fallback in `image-pipeline.ts` yields a frame and then
waits the caller's timeout. An earlier version was `setTimeout(job, 120)`, which
discarded the timeout entirely and made every deferral in the codebase 66×
more aggressive than written on WebKit.

## 7. Never assume a pale pixel is background

Three separate bugs came from this:

- a flood fill that ate white leather because it read as "background"
- a fringe detector that failed every white garment for having a white edge
- a quality gate that discarded perfectly good cuts of pale pieces

Colour thresholds must be **relative to the garment**, not absolute. See
`fringeLumThreshold` in `image-pipeline.ts` for the pattern.

## 8. Reads go through the cache layer in `profile-data.ts`

`cachedGet()` coalesces identical concurrent reads; `invalidatingDb()` expires a
table automatically after any write. Use `db()` from that file rather than
touching `window.__workspaceDb` directly, or a write will leave stale data on
screen until reload.

Cold start once issued **13 round-trips**, five of them the same
`wardrobe_pieces` query.

## 9. Do not run heavy models in the browser

`ALLOW_CLIENT_SIDE_REMOVAL` is `false` deliberately. The @imgly fallback pulls
an ~84 MB model and runs inference on the main thread where it cannot be
interrupted. When a missing API key silently routed every garment into it, it
consumed **91% of all non-idle CPU** in a five-minute session.

If background removal fails, leave the photograph uncut and retry next visit. A
degraded image beats an unusable app.

## 10. Surface errors — never swallow them

A `try { … } catch { /* fall through */ }` around a network call cost five
rounds of blind testing: a missing API key, a wrong host allow-list, a CORS
block and a rejected cutout all produced the same silent nothing.

If a call fails, log what failed and why, with enough context to act on.

---

## Before shipping a batch of UI work

Record a DevTools Performance profile of ordinary use and check **INP**. Under
200 ms is healthy. If it has moved into seconds, something on this list has been
broken again.

Full history and measurements: `PERFORMANCE.md` in the repository root.
