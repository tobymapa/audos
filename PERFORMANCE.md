# Ethaion — performance work

Running log of performance changes, what caused each problem, and what is still
outstanding. This is the single notes file for this work; it gets updated in
place rather than added to.

Lives at the repo root deliberately: everything inside `audos-workspace-899782/`
syncs into the Audos workspace as an app file, and this is documentation, not
part of the app.

---

## Status

| | |
| --- | --- |
| Passes completed | 2 (boot/save pass, then audit tier 1) |
| Files modified | 11 |
| New source files | none |
| Build | all 5 entry points compile |
| Types | 37 errors, identical to the original — none introduced |
| Behavioural tests | 46 passing |

---

## Pass 1 — cold start, saving, stale images

### Cold start fired the same query five times

`useWorkspaceDB('wardrobe_pieces')` read the table for the live list, then four
housekeeping audits each opened their **own** read of the same table in the same
tick. With profile, rubric, budgets, prefs, materials, details and attributes on
top, first paint waited on roughly **13 round-trips**, five of them identical.

Each audit that changed anything also called `refreshPieces()` independently, so
a wardrobe needing all four fixes re-fetched and re-rendered the whole list four
times on arrival.

**Fixed** with a read layer inlined at the top of `profile-data.ts`:

- `cachedGet()` collapses concurrent identical reads into one in-flight promise
  and holds the result for a short TTL.
- `invalidatingDb()` wraps the SDK so any write expires that table's cache
  automatically — a future write cannot forget to invalidate.
- `sharedPiecesRead()` is the single boot read the four audits share.
- `pooled()` runs jobs with bounded concurrency instead of serial `await`s.

Boot now costs **one** `wardrobe_pieces` read; profile and rubric go out in
parallel rather than one after the other.

### The audits ran during first paint

Now behind `whenIdle(…, 4000)` in an explicit phase 2, run at most once per page
load, and coalesced into a single refresh at the end. Their internal write loops
were serial — ten corrections meant ten sequential round-trips — and now run four
at a time. `fetchMaterials()` was being called *inside* the duplicate-merge loop,
once per group; it is now read once, and only when there is something to merge.

### Stale photos

`canonical-garment.tsx` kept a module-level map of images pushed by the pipeline,
and returned it **ahead of the database value**. Nothing ever removed an entry.

So once a piece had been through the pipeline its tile was pinned to that URL for
the life of the page. Replacing the photo, editing the piece, or deleting it and
adding another kept painting the superseded picture — and closing the app and
reopening it from the dock brought the old image straight back, because the
module outlived the component tree.

The registry is now **advisory**: inside a 20-second grace window a pushed URL
wins, because it genuinely is newer than anything the DB can have returned yet.
Outside it, the piece row is authoritative and the stale entry is evicted.
Deleting a piece also clears its local image caches.

### Saving was serial where it needn't be

- `updatePiece()` wrote three tables one after another → one `Promise.all`.
- The edit sheet awaited a fourth write (`piece_details`) → folded into that batch.
- `attachPreparedProductPhoto()` (choose-a-product-from-a-link) did four
  sequential writes before the image appeared → the visible one goes first, the
  three bookkeeping writes follow together.
- `deletePiece()` cleaned **ten companion tables serially**, 20+ sequential
  round-trips to remove one item → concurrent, and only the piece row blocks the
  caller.
- "Clear wardrobe" deleted one at a time → four at a time.

### A refresh loop after every photo

The photo-migration sweep started 350 ms after pieces arrived — on top of first
paint — running the heaviest main-thread work in the app while the user was
trying to scroll. On completion it called `refreshAll()` while `pieces` was in
its own dependency array, re-arming itself. It also declared three dependencies
it never read.

Now: waits for a genuinely idle browser (8 s first run, 1.2 s after), refreshes
only the piece rows, honest dependency array. The `piece-photo-settled` listener
was likewise narrowed from `refreshAll` to `refreshPieces`.

### 22,400 string comparisons per list rebuild

`normalizePiece()` calls `categorizeItem()`, which scans the name against all
**224** slot keywords. A 100-piece wardrobe did ~22,400 `includes()` calls every
time the list rebuilt — on every optimistic patch, attribute refresh and tab
change. Both functions are pure, so both are memoised: `categorizeItem` on the
lowercased name, `normalizePiece` in a `WeakMap` keyed on the raw row object.

---

## Pass 2 — external audit, tier 1

Five items from the audit were already resolved by pass 1 (the profile/rubric
waterfall, redundant wardrobe fetches, the 350 ms migration start, the sequential
delete, part of the N+1 on multi-piece writes). The remaining tier-1 items:

### The global re-render broadcast

`ethaion:garment-image-ready` carried no payload, and every mounted tile listened
and bumped state. One cutout finishing re-rendered **every tile on screen, plus
every tile in every previously-visited tab** — those stay mounted under
`display:none`. During the migration sweep that is hundreds of full-grid
re-renders, and it magnified everything else.

The event now carries `pieceId` and `source`; tiles ignore anything that is not
theirs. Measured: 60-tile grid went from 60 re-renders per cutout to 1. `source`
is included as well as `pieceId` so two pieces sharing one photograph (duplicates
mid-merge) both wake.

### First render blocked on the entitlement check

`Desktop.tsx` held a full-screen spinner until the subscription request resolved,
up to an 8-second timeout — even for a returning customer whose status was
already cached locally. The provider read that cache, but only in an effect, and
never flipped `subscriptionReady`.

The provider now seeds subscription state from cache on the **first** render, and
Desktop treats a cached verdict as sufficient. Revalidation continues in the
background and `checkAppAccess` redirects if the fresh answer differs.

> Safety note: the pre-existing timeout fallback unblocked with **no** verdict at
> all, so proceeding on a cached verdict is strictly safer than the behaviour it
> replaced.

### A poll that ran while hidden

The Dossier has two 2.5 s polls. Both are legitimate — Beau's `save_rubric` runs
server-side and cannot dispatch a browser event, so polling is the only way a
chat-authored edit appears without a reload.

The **profile** poll already had an `offsetParent` guard. The **taste-reference**
poll did not, and kept reading the database and replacing state for a screen the
customer had navigated away from. Added a `useVisibleInterval` hook: the interval
still ticks, but only does work when the document is visible and the element is
not inside a hidden subtree. Returning to the screen refreshes immediately.

### `withTimeout` stopped waiting without stopping working

No `AbortController` anywhere in `photo-enhance.ts`. A timed-out Photoroom call
kept its request open and kept consuming network while the fallback tier started
a separate removal of the same photograph — the two competing at exactly the
moment the pipeline was already behind.

`withTimeout` now takes an aborter. The Photoroom request is genuinely cancelled.
For the @imgly fallback only the source fetch is cancellable; once its WASM
inference starts it cannot be interrupted from the main thread.

### The same photo compressed twice

`add-piece` compressed on pick (so the preview appears instantly), then handed
that File to `uploadGarmentPhotoFast`, which compressed it again — a redundant
decode, canvas redraw and JPEG encode of every photo added, on the main thread.
It also degraded quality: re-encoding an encoded frame at 0.85 compounds
artefacts. Now compressed once.

---

## Pass 3 — the load waterfall (found via PageSpeed Insights)

PageSpeed on `www.ethaion.com`: mobile 61 (FCP 5.4s, LCP 7.7s), desktop 86
(FCP 1.2s, LCP 1.6s). **Total Blocking Time 0ms on both** — so JavaScript was
not jamming the main thread during load. The desktop/mobile gap and the
0ms TBT together point at a network-bound problem, not a CPU one.

The LCP breakdown named it: 480ms to first byte, then **2,330ms of "element
render delay"** — and the element was `<p class="eg-body">`, a plain paragraph
on the email gate.

**Cause.** `Desktop.tsx` statically imported `AgentChat` → `AgentChatView` →
`react-markdown` + `remark-gfm`. Those resolve through the CDN importmap as
unbundled ES modules, so the transitive tree (`mdast-util-*`,
`micromark-util-*`, `unist-util-*`, `zwitch`, `ccount`, `devlop`,
`longest-streak` …) arrived as roughly **forty separate half-kilobyte
requests, chained** — each ~2,000ms on a throttled connection. Maximum
critical-path latency: 2,929ms.

Nobody was looking at the chat during that time. `config.json` sets
`defaultLandingView: "app"` and `customerLandsOnAgent: false`.

**Fixed** by deferring four shell surfaces behind `React.lazy` +
`Suspense`: `AgentChat`, `BeauConversations`, `FileBrowser`, `Settings`.
`EmailGate` stays static — it is the first screen for a new visitor.

Result: the eager module graph from `Desktop.tsx` drops to 6 modules whose only
CDN dependencies are React and lucide-react. The first-paint bundle goes from
**193 KB to 85 KB — 56% smaller** — and the entire markdown dependency chain
leaves the critical path.

### Still outstanding on load

- **Render-blocking assets** — PageSpeed estimates 1,750ms available: the
  cookie-consent script from jsDelivr (17.4 KiB, 1,620ms) and Google Fonts CSS
  (750ms). These may live in platform-controlled HTML rather than the
  workspace; needs checking before it can be actioned.
- **lucide-react at 172.60 KiB** — `Desktop.tsx` imports roughly 200 icons in a
  single statement, most of which no space uses. Worth trimming to the icons
  actually referenced.

---

## Pass 4 — the interaction stall (found via a DevTools profile)

A Performance recording of ordinary use, which is the only thing that could see
this — PageSpeed reports Total Blocking Time of 0ms because it measures load,
not interaction.

| Metric | Value | Good |
| --- | --- | --- |
| INP (Interaction to Next Paint) | **11,845 ms** | < 200 ms |
| Longest frame | **16,932 ms** | 16 ms |

The network track showed `image-to-image` requests repeating throughout.

**Cause.** Every garment tile that rendered — not every *visible* tile, every
*mounted* one, including off-screen rows and tiles in tabs the customer had
already left — scheduled a full ingestion run. Each run can involve, in
sequence: `classifyImage` (vision AI), `removeBackgroundFromUrl` (Photoroom, or
the 84 MB WASM fallback), `isolateGarmentViaSegmentation` (**generative
image-to-image**), and `verifyCutoutWithVision` (vision AI again) — with canvas
pixel work on the main thread between each. Two at a time, through the whole
wardrobe.

### `whenIdle` was discarding its timeout

The scheduler everything defers through:

```js
else window.setTimeout(job, 120);   // the caller's timeout, ignored
```

`requestIdleCallback` does not exist in Safari, and every iOS browser is WebKit
underneath. So on WebKit all six deferral points ran 120 ms after mount
regardless of what was asked for — including the deliberate 8-second delay on
the photo sweep added in pass 1, which was landing directly on first paint.
Every deferral in the codebase was 66× more aggressive than written.

Now yields past the current frame, then honours the caller's timeout.

### Containment

- **On-screen gate** — `CanonicalGarment` now uses an `IntersectionObserver`
  (200px `rootMargin`) so a tile earns its ingestion by being looked at.
  Off-screen rows and hidden tabs schedule nothing.
- **Per-session budget** — at most 8 new pieces ingest per visit
  (`SESSION_INGEST_BUDGET`). Concurrency was already capped at 2, but that
  limited the *rate*, not the *total*: sixty uncut pieces still ground through
  all sixty, which is why the app stayed unresponsive long after load. The
  store is durable, so the wardrobe converges over a few visits instead of
  holding one visit hostage.

### Tier 3 kept, deliberately

`isolateGarmentViaSegmentation` (the generative image-to-image call) was
considered for removal. It was kept: it is what lifts a garment off a model for
pieces whose only photography is on-body, and without it those tiles show the
garment on a body rather than isolated. Containment limits it to at most 8
on-screen pieces per session, which moves it from a performance problem to an
acceptable cost.

### The architectural point

Background removal, garment isolation and vision verification are server work.
Doing them in the browser means the customer's device and main thread pay for
every garment, every session, forever. The containment above buys relief; it
does not change where the cost lives. Moving ingestion server-side — process on
upload, store the cutout, client displays it — is the fix that actually removes
the problem.

---

## Pass 5 — the root cause (found in a DevTools trace)

A full trace of a 295-second session, analysed by aggregating the CPU profile
samples. This is the finding that matters; everything before it was treating
symptoms.

| | Self time | Share of non-idle CPU |
| --- | --- | --- |
| `wasm-function[2019]` | 56.6 s | 71% |
| other WASM frames + `background-removal.mjs` | ~17 s | ~20% |
| **WebAssembly total** | **~73 s** | **~91%** |
| `erodeAlpha` — all canvas work in photo-enhance.ts | **0.31 s** | 0.4% |

The canvas pixel work that the external audit flagged as HIGH severity, and
that pass 4 planned to move into a Web Worker, is **314 milliseconds**. It was
never the problem.

**The cause.** Network events in the same trace:

```
/api/workspaces/<id>/secrets/proxy   →  HTTP 400   (×2)
```

That is the Photoroom call. It failed, and `removeBackgroundViaPhotoroom` then
latched `photoroomUnavailable = true` for the session, routing every subsequent
garment into the @imgly fallback — an ~84MB FP16 model plus the ONNX/WASM
runtime, running inference on the main thread where it cannot be interrupted.

One unconfigured secret produced an 11-second Interaction to Next Paint and a
17-second frozen frame, with no error any user or developer would notice: the
images still appeared, eventually.

**The fix is configuration, not code** — `PHOTOROOM_API_KEY` needs to exist for
this workspace, and `api.photoroom.com` needs to be an allow-listed proxy host.

**The code guard.** `ALLOW_CLIENT_SIDE_REMOVAL` is now `false`. If Photoroom
fails, the pipeline throws, the piece keeps its original photograph, nothing is
marked settled, and the next visit retries. A degraded image beats an unusable
app — and this stops a future expired key or outage silently recreating the
same freeze.

### Confirmation that passes 1–4 landed

Same trace: `wardrobe_pieces` was read **4 times across five minutes** (it was
~13 per load before pass 1), and only 4 cutouts were stored — the session
budget from pass 4 holding. The earlier work is functioning; it simply could
not compensate for an 84MB model on the main thread.

### Also surfaced, not yet actioned

- `/api/generate/vision` called **38 times** in one session — `classifyImage`
  plus `verifyCutoutWithVision`. Worth reducing once Photoroom is healthy.
- `/api/apify/run` returned **HTTP 502 twelve times**. Failing silently;
  unrelated to performance but broken.

---

## Pass 6 — the white-on-white bug

With the Photoroom key added, a white leather sneaker still came out with bites
taken from it: brown sole and tan lining intact, white leather destroyed. The
same photograph cut correctly on Photoroom's own site.

**It was not Photoroom's output.** The damage came from `whiteToTransparent`,
which only runs in tier 3 — the generative fallback. That function flood-fills
inward from the frame edges through every pixel that reads as background:

```js
if (lumOf(r, g, b) < 0.82 || chromaOf(r, g, b) > 0.08) return false;
```

White leather sits near 0.9 luminance with almost no chroma, so it **passes as
background**. The flood walked in from the edge, through the shoe, and stopped
only where something darker blocked it. No threshold fixes this — a white
garment on a white ground is not separable by colour, which is precisely the
problem a segmentation service exists to solve.

**Fixed** by handing tier 3's isolated image to Photoroom rather than
flood-filling it. Photoroom separates by subject, not colour. One extra call on
a tier that should now be rare, replacing a heuristic that could never be right.

`whiteToTransparent` is left in place but unused, and is tree-shaken out of the
bundle.

**Re-cut triggered.** `CUTOUT_PIPELINE_VERSION` 5 → 6 and the localStorage
mirror prefix bumped to match. Hydration skips rows below the current version,
so every cutout made while Photoroom was unavailable re-ingests once. With the
per-session budget in place the wardrobe converges over several visits rather
than reprocessing at once.

### Pre-existing type error, examined and left alone

`photo-enhance.ts` passes `4` to a parameter typed `FlatLayTier = 0 | 1 | 2 | 3`
in the on-body fallback. Checked: the only rule that reads it is
`tier === 1 || tier === 3` (safe to compose), which excludes 2 and 4 equally.
Behaviourally identical, so it is a type error with no runtime effect. Not
changed — it predates this work.

---

## Outstanding

From the audit, not yet done.

**Tier 2 — real engineering, high value**

- **Move pixel work off the UI thread.** Alpha erosion, connected-component
  analysis, flood fills and cropping run synchronously on ~900px images. This is
  the actual source of main-thread stalls. The functions are nearly pure, so a
  Worker with `OffscreenCanvas` is a clean port, but it needs a main-thread
  fallback for engines without support.
- **Viewport-gate image resolution.** Every mounted product card and Fitting
  shelf thumb starts its own resolution flow — og:image lookup, image search,
  gallery crawl, up to six vision classifications — on or off screen.
  `loading="lazy"` defers only the `<img>`, not the effect. Needs an
  `IntersectionObserver` gating the effect itself.
- **Make the V51 batch durable.** Its guard is `localStorage`, so a new device
  re-runs a per-garment vision verification even though `image_cutouts` already
  holds the answers. Move the guard into the database.
- **Chat streaming.** `flushSync` per token, full Markdown reparse of the
  accumulated string, synchronous scroll. Batch tokens on `requestAnimationFrame`,
  memoise rendered Markdown per completed message, virtualise past ~50 messages.

**Tier 3 — architectural**

- Responsive image variants — 900px transparent PNGs render in 64px tiles.
  Depends on whether the storage layer supports resize parameters.
- Sub-surface code splitting in `curated` and `scout`: the first visit to one
  sub-tab downloads every sibling's code and static data.
- An LRU cap on kept-alive tabs instead of unbounded `display:none` accumulation.

**A recommendation rather than an optimisation:** the @imgly fallback pulls an
~84 MB FP16 model plus the ONNX/WASM runtime. Rather than optimising that
download, consider not falling back to client-side WASM at all and queueing the
piece for a server-side retry. A user on mobile data hitting an 84 MB download is
a worse outcome than a photo that finishes processing a minute later.

---

## Tunables

Two values chosen by judgement, worth revisiting with real usage:

- **Read cache TTL — 1.5 s** (`cachedGet` default, `profile-data.ts`). Tuned to
  absorb the boot burst and the re-render storm after a write. If a surface needs
  to see another tab's write faster, pass `0` as the fourth argument at that call
  site.
- **Live-image grace window — 20 s** (`REGISTRY_GRACE_MS`,
  `canonical-garment.tsx`). Long enough for a slow pipeline result to beat the
  database. Too short would reintroduce a flicker back to the old image
  mid-processing; too long delays recovery from a stale push.
