# Pretrained YOLOv8 Nano card-recognition migration plan

Status: reviewed handoff plan; no scanner code has been changed. Use the existing pretrained card checkpoint first; its export, local validation, and measured recognition results are still required.
Prepared: 2026-11-01.
Revised: ship `mustafakemal0146/playing-cards-yolov8` first. Custom training is future work and is not a prerequisite for this migration. Open-vocabulary inference and prompt preparation are out of scope.

## Outcome and constraints

Replace the photo scanner's face/corner heuristics, Tesseract rank OCR, and suit-template matching with the existing card-trained YOLOv8n checkpoint from [`mustafakemal0146/playing-cards-yolov8`](https://huggingface.co/mustafakemal0146/playing-cards-yolov8), exported to ONNX for local inference. Build the versioned model boundary so a custom-trained replacement can be introduced later. Finish with no Tesseract dependency, language files, OCR workers, or legacy recognition fallback in the application.

- Keep photo upload, camera capture, review/correction, and 9/10-card arrangement analysis.
- Run recognition on the user's device. No hosted inference API, subscription, account, Python server, or photo upload is required.
- Use Python only for reproducible model preparation and evaluation outside the Next.js runtime.
- Do not create a training pipeline, assemble a training dataset, require a training GPU, or train YOLO26n for the first release. Export and evaluate the selected existing weights.
- Preserve game rules, AI/EV behavior, card IDs, duplicate validation, and the maximum of three wildcards.
- Use learned, fixed card classes rather than zero-shot/text/visual prompts. Better card accuracy must come from representative card-specific weights and evaluation, not just disabling open vocabulary.
- Use a detection-only model: no text encoder, tokenizer, prompt embeddings, segmentation branch, or second recognition model in the preparation or inference pipeline.
- Target single-photo recognition first. Continuous camera/video inference is outside this migration.
- The selected model remains subject to its published license. This plan uses the model the user selected; it does not relicense its weights or introduce a paid service.

## Handoff prerequisites and decision gates

The selected card-trained weights already exist on Hugging Face. The repository still needs a pinned download, verified checkpoint metadata, ONNX export, and evaluation photos. The existing optional fan-photo path is not a benchmark corpus. No new trained checkpoint or training dataset is required to begin this migration.

| Gate | Required deliverable | Work enabled |
| --- | --- | --- |
| A — source verification | Exact Hugging Face revision/file/hash, verified YOLOv8n detection architecture and class order, observed box annotation policy, development/test photo manifests | Export/evaluate the existing checkpoint; application contracts/tests may be prepared independently |
| B — deployable artifact | Exported selected checkpoint, pinned exporter/runtime versions, verified ONNX output signature, manifest, Python/ONNX parity report, browser WebGPU/WASM smoke check | Final decoder implementation and full model integration |
| C — release | Held-out accuracy/correction report, named-device performance report, lifecycle/privacy checks, production asset and removal verification | Production release of the cleaned YOLO-only candidate |

At Gate A, inspect and record the checkpoint's actual classes and box policy rather than inventing a new training specification. The model card describes 52 ordinary cards, so the initial release uses manual wildcard marking. At Gate B, record the output decoder/NMS settings, exact opset, package versions, and immutable asset version before implementing the final decoder. For Gate C, first pass model/UI acceptance on the candidate branch, then remove OCR there and rerun checks including removal verification; release only after that final pass. These are implementation decisions within the agreed scope, not additional user approval steps.

If a gate cannot be met, record the specific missing artifact or failed benchmark and continue independent contract/UI/test work. Retain the existing production scanner until Gate C; development stubs or stock COCO inference must not be presented as card recognition. Do not silently switch architectures, introduce a training requirement, remove acceptance conditions, or declare the migration complete.

## Current implementation and integration points

| File | Current responsibility | Planned treatment |
| --- | --- | --- |
| `lib/card-recognition.ts` | `DetectedCard`, validation, hand conversion, light-face detection, OCR initialization, rank reading, suit matching, previews | Preserve the public entry point and validation contract; replace recognition internals |
| `lib/card-corner-recognition.ts` | Ink segmentation, rank/suit pairing, rotation correction, OCR-assisted recognition | Delete after YOLO cutover; do not retain as a hidden fallback |
| `components/CardPhotoRecognition.tsx` | Starts scans, aborts/retries, 120-second timeout, progress, review/edit/select, overlays | Integrate worker lifecycle, typed progress/errors, and uncertainty handling |
| `components/CardCameraCapture.tsx` | Upload/blob URLs, camera lifecycle, captured image, manual-entry escape | Preserve capture UX; connect cancellation and resource cleanup |
| `app/helper/page.tsx` | Photo/manual/analysis flow | Ensure hidden or inactive photo views release recognition resources |
| `lib/use-helper-analysis.ts`, `lib/helper-analysis.worker.ts` | Separate arrangement worker | Preserve; recognition gets its own worker and memory lifecycle |
| `tests/card-recognition.test.mjs` | Validation, cancellation, face/corner heuristics | Keep domain tests; replace algorithm-specific tests |
| `tests/card-recognition-images.test.mjs` | Generated card images, Tesseract adapter/data cache, optional fan reference | Replace OCR setup with model-backed integration/evaluation coverage |
| `package.json`, `package-lock.json`, `README.md` | Tesseract dependency and scanning documentation | Add the ONNX runtime, then remove Tesseract and obsolete instructions |

The repository already has Node built-in tests despite `AGENTS.md` saying that no test directory exists. Use the actual tests and update that stale documentation when the migration lands. The optional fan photo is referenced through `ONGDU_FAN_REFERENCE_PHOTO`; it is not a checked-in benchmark corpus.

## Architecture decisions

### Model and fixed card classes

Use the checkpoint file `playing_cards_model_0_playing-cards-colab.pt` from [`mustafakemal0146/playing-cards-yolov8`](https://huggingface.co/mustafakemal0146/playing-cards-yolov8/tree/main). The repository lists a ~6.27 MB PyTorch artifact and describes YOLOv8n trained on 52 playing-card identities. Pin the full repository commit and SHA-256 before export; confirm actual architecture, task, input size, class count, and class names from the artifact rather than relying only on the model card.

Export these existing card weights directly. Do not substitute stock `yolov8n.pt`, stock YOLO26n, YOLOE, YOLO-World, a prompt-free open-vocabulary checkpoint, a segmentation model, or a larger detector. The initial implementation is an export/integration task, not a training task. Record the uploader's license/provenance alongside applicable upstream notices; do not relicense the checkpoint.

Read the checkpoint's fixed class order and explicitly map all 52 ordinary identities to the game's rank/suit types. If names differ from `AS`, `10H`, `QD`, normalize through that mapping rather than renaming classes in a way that implies retraining. If artifact metadata disagrees with the model card or does not cover the ordinary deck, report the discrepancy before proceeding. Jokers are not an initial model class: preserve manual `WILD` marking/addition and document that limitation.

Keep the inspected class order explicit in `classes.json`. Model class IDs must map directly to domain rank/suit values; they must never depend on alphabetic sorting at runtime. Unsupported or weak identities stay unknown in review. There is no generic-card fallback model or runtime class discovery.

Inspect the pretrained detector's box behavior on example images and a development pilot: determine whether it detects exposed corner indices or whole card faces. Record the observed `annotationTarget` in the manifest and implement matching postprocessing. Its learned target cannot be changed simply by changing metadata. Measure opposite-corner duplicate counting early; use validated geometry or keep ambiguous candidates reviewable. If this prevents acceptance, report the limitation for future model improvement rather than adding a second detector or retraining as an implicit part of this migration.

Measure this checkpoint's accuracy, precision, image resolution, and number of passes in Ongdu's environment. Pretraining does not establish robustness across every deck or hand layout. Custom training remains a separate future project; the replacement contract below is the only training-related work required now.

### Browser execution

```text
Camera/upload -> bounded image decode -> recognition worker
  -> preprocessing + pretrained fixed-class YOLOv8n ONNX inference
  -> coordinate mapping + duplicate/conflict handling
  -> DetectedCard[] -> existing review -> existing arrangement worker
```

- Add a pinned stable `onnxruntime-web` version verified against the export.
- Try WebGPU inside a dedicated worker; use an FP32 WASM-compatible export as the portable baseline/fallback. Detect capabilities at runtime rather than relying on user-agent/browser names.
- Run ONNX Runtime directly in the application-owned worker, with `ort.env.wasm.proxy = false`. Use `ort.env.wasm.numThreads = 1` as the baseline so WASM does not require cross-origin isolation or nested threading workers. Do not add COOP/COEP headers as a prerequisite for this migration. Any later threading optimization needs its own compatibility check. [Runtime flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- Introduce FP16 only after parity and device tests. Lack of `shader-f16`, unsupported kernels, session creation failure, device loss, or inference failure must permit a bounded WASM retry. INT8 is a later optimization requiring representative calibration and accuracy checks.
- Retry a failed GPU request at most once on WASM, within the scan's overall deadline; never retry an aborted request. Start the WASM attempt with a clean worker/runtime and the retained source image rather than reusing a possibly poisoned session or detached transfer buffer. Mark GPU unusable for that flow after failure to avoid repeating the failure on every tile/rescan. Do not keep GPU and CPU sessions live together.
- Do not load model bytes during SSR or on the game/manual-entry paths. Use worker-local imports and the existing `new Worker(new URL(..., import.meta.url))` pattern.
- Feature-detect `OffscreenCanvas`/worker image decoding. If unavailable, decode a bounded image on the main thread and transfer RGBA data to the worker; tensor preparation and inference still run there.
- Keep only one active recognition request/session per mounted photo flow. Reuse the session for rescan while active. Release it when leaving the flow, unmounting, or starting arrangement analysis; model bytes can remain in the browser's asset cache.
- Preserve image orientation consistently between inference, previews, and the displayed source. Test EXIF-oriented uploads explicitly.

### Assets and reproducibility

Create a model preparation directory, separate from npm application dependencies:

```text
scripts/card-recognition/
  requirements.txt       # exact tested Python package versions
  prepare_model.py       # download pinned selected weights, inspect, export, hash
  evaluate.py            # fixed-corpus evaluation and comparison
models/card-recognition/
  classes.json           # fixed trained classes and domain-label mapping
  README.md              # preparation commands and provenance
public/models/card-recognition/<version>/
  manifest.json
  detector.onnx          # required baseline; actual name records precision
  LICENSE.txt
  NOTICE.txt             # applicable attribution/provenance
public/onnxruntime/<version>/
  <required runtime assets from the pinned npm package>
```

The manifest records architecture/scale, selected checkpoint repository/file/revision/hash, published training provenance (or `unknown` for unavailable details), development/test corpus versions, observed annotation target, model/export version, class mapping/hash, tool versions, opset, input name/shape/dtype/color order, normalization, padding, output names/layout/units, postprocessing mode, expected byte sizes, asset hashes, and benchmark report identifier. Do not claim access to the original training split if the uploader does not provide it. Include the tested thresholds and tile/grouping configuration so a model replacement cannot silently inherit unsuitable tuning. Optional optimized variants get their own entries. Verify that no encoder, prompt, vocabulary, or mask assets are required by the exported graph.

### Replaceable model contract

Make `manifest.json` the model boundary, checked by an explicit runtime validator written in TypeScript and a preparation-time validator. Type assertions alone do not validate downloaded JSON. Define these compatibility fields before runtime integration:

- `schemaVersion`: initially `1`; reject unsupported versions with a recoverable error.
- `modelVersion` and `runtimeCompatibility`: immutable model ID and exact tested ONNX Runtime package version.
- `preprocessVersion`: initially `letterbox-rgb-v1`, fixed batch-one NCHW `[1,3,640,640]`, explicit input dtype, RGB scaling, padding value, and resize/rounding rules. Optimized variants must specify their actual dtype rather than inheriting FP32 implicitly.
- `decoderVersion`: one explicitly implemented parser for the inspected export, with output names, shape constraints, score semantics, coordinate units/box convention, and head/NMS mode. Do not infer a decoder solely from tensor dimensions or silently reinterpret an unknown schema.
- `annotationTarget`: `corner-index` or `card-face`, selecting a tested physical-instance postprocessing policy.
- `classes`: complete numeric class-ID to domain-rank/suit mapping for the inspected 52-class checkpoint. A future trained joker class may map to `WILD`/`wild` through a validated replacement manifest. Reject missing IDs, invalid ranks/suits, or a class count that disagrees with model metadata/output semantics. Unknown is a review state, not an initial learned class.
- `assets`: required FP32 model and optional optimized variants, each with URL, exact byte length, SHA-256, input/output contract, and supported execution providers.
- `postprocess`: candidate/trusted thresholds, duplicate/conflict rules version, candidate limits and optional tile settings. Keep application safety caps separate so a manifest cannot enable unlimited passes or allocations.

Expose a single application-owned active manifest URL/configuration. Retraining the same architecture with the same interface means publishing a new versioned asset directory, validating it, and switching that configuration; no UI change is required. Class ordering changes are safe only with the corresponding validated mapping. Changing annotation policy, preprocessing, decoder, architecture, or supported operations requires the applicable adapter/test updates and is not automatically a drop-in replacement.

For each replacement, run fixture parity, held-out accuracy, both browser providers, lifecycle checks, and asset-size checks. Publish the complete immutable asset directory before updating the active manifest; keep the previous artifact available for release rollback. Never overwrite an existing versioned model or mix its class map with a new model from cache. Manual entry remains usable if an incompatible or missing artifact is encountered.

Self-host model and runtime assets on the app's origin; do not require Hugging Face or a third-party runtime CDN during scanning. Use immutable versioned URLs and cache headers. Validate manifests and downloaded artifact hashes before creating a session; do not cache failed/partial responses. Use normal HTTP caching first, with graceful operation when storage persistence is unavailable. Do not claim a fully offline app: a first load requires asset downloads, and offline behavior depends on cached resources.

Copy required `.wasm`/module assets from the exact pinned ONNX Runtime npm package with a deterministic preparation command, then configure `wasmPaths` accordingly. Verify MIME types, relative URLs, and worker loading under `npm start`; a dev-server success alone is insufficient. JavaScript and WASM assets must be from the same package build. Default to the checked-in final small model plus a local runtime-asset copy step; if the model cannot be checked in, document its explicit fetch command and add a read-only prebuild verification that fails clearly when assets are absent. Do not add an implicit network/model-training step to `npm run build`. [Runtime deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html)

Measure the exported ONNX and runtime payloads; PyTorch checkpoint size is not the browser download size or runtime memory budget. Keep large training datasets, intermediate checkpoints, virtual environments, model caches, and generated benchmark output ignored. Publish the small final runtime artifact with the app if practical; otherwise document a deterministic preparation step required before build/deploy. A normal production build must not train, fetch, or export a model implicitly.

## Implementation sequence

### Phase 1 — establish the baseline and model feasibility

1. Record clean Git status and existing scanner behavior. Run the Node domain/worker tests, lint, and build; evaluate current OCR on the shared image corpus before removing it.
2. Assemble an initial 100-image, human-labeled, held-out evaluation set: roughly 30 easy 9/10-card hands, 30 fanned/overlapping hands, 20 difficult lighting/rotation/background examples, 10 joker examples, and 10 negative scenes. Keep the 30 easy and 30 fanned images as fully readable ordinary-card hands for exact-hand acceptance; put partially unreadable and >10-card scenes in the difficult cohort. Include all suits/ranks and at least three deck designs. Store an image/label/license manifest; use permissioned or public test photos, not automatic collection from users.
3. Label physical-card instance IDs, each visible corner's owning card, identity readability, and card identities; mark whole-card/corner geometry where useful. Keep all 100 images out of threshold selection and postprocessing experiments. Use separate development photos for tuning, splitting by deck/scene so near-duplicate frames cannot cross sets. No training set is required for this release; independence from the uploader's undisclosed original data cannot be guaranteed and must be noted.
4. Download and inspect the selected pretrained YOLOv8n checkpoint at a pinned revision/hash. Verify its 52-class mapping, task and box behavior on development photos; measure its class confusion, misses, duplicate detections, and ordinary-hand accuracy against OCR.
5. Export the unchanged pretrained checkpoint with pinned tools. Verify PyTorch-to-ONNX parity on fixed inputs and run the real export in a minimal browser worker on WebGPU and WASM before a large UI rewrite. No weight updates or custom training are part of this step.
6. Tune thresholds and physical-instance postprocessing on development photos, then evaluate the frozen export/configuration on the held-out corpus. Publish actual artifact sizes, cold/warm timings, OCR comparison and all Gate A/B decisions. Verify that only the fixed-class detector and runtime are downloaded.

**Exit:** a reproducible Nano export, working browser inference, and evidence that rank/suit recognition is useful. If localization works but identity fails, report that result and keep model experimentation separate from production cutover. Do not treat a generic card detector as a completed Tesseract replacement.

### Phase 2 — add a typed recognition boundary

Introduce the following modules, keeping pure helpers separate from browser lifecycle code:

| Proposed file | Responsibility |
| --- | --- |
| `lib/card-recognition-types.ts` | Shared review types, progress/error types, manifest and worker request/response unions |
| `lib/card-recognition-client.ts` | Worker/session ownership, request correlation, abort, timeout, cleanup |
| `lib/card-recognition.worker.ts` | Load assets/runtime, choose execution provider, preprocess, infer, return results |
| `lib/card-recognition-preprocess.ts` | Letterbox/tile transforms and inverse coordinate mapping |
| `lib/card-recognition-postprocess.ts` | Decode the verified output layout, map classes, resolve overlapping candidates |
| `lib/card-recognition.ts` | Public facade, rank list, unchanged validation/hand conversion, photo-to-review adapter |

Use discriminated request/response unions with request IDs. Responses distinguish progress, result, cancellation, and typed errors. Define stages such as `loading-model`, `preparing-image`, `detecting`, and `preparing-review`; include numeric download progress only when a reliable total is available.

Preserve `recognizeCardPhoto(source, signal, progress)` as the facade if feasible, adapting callers to typed progress deliberately. Preserve `DetectedCard`'s rank/suit/preview/uncertain/included/normalized-region fields. Add optional detection score and an uncertainty reason for diagnostics/review, without changing domain `Card` or using detection scores as win probabilities.

An already-aborted request must reject before decode, download, or worker startup. Abort all outstanding asset fetches; reject pending promises and terminate the active worker to cancel non-interruptible inference. Ignore late progress/results from earlier request IDs. Worker errors, message errors, or failed initialization must reject once and clear pending work. Retry starts a fresh usable worker after failure. Development Strict Mode must not leave duplicate sessions alive. A mounted photo flow owns its client instance: there is no global worker singleton whose cancellation could break another caller. Separate normal disposal (await session release then terminate) from hard abort (terminate immediately and do not await a hung session).

### Phase 3 — implement image processing and inference

1. Decode the browser-supported photo type once. Check dimensions and cap working-image resolution using a measured memory budget; retain enough detail for corner crops instead of always shrinking the only source to 640 px. Prefer decode-time resizing when supported: resizing a canvas after a full decode does not eliminate the original decode's peak memory. Gate B must record byte/dimension/working-pixel limits and prove the fallback path on a large phone image. Reject unreadable or excessive inputs with an actionable message.
2. Letterbox to the export's tested input size, initially 640×640, preserving aspect ratio. Match RGB order, dtype, CHW layout, padding value, and pixel normalization exactly to the export reference.
3. Run one full-image pass. If evaluation demonstrates a worthwhile benefit, allow at most four overlapping tiles from the higher-resolution working image. Bound the tile dimensions, overlap, total passes (maximum five), and processing deadline. Do not add combinatorial rotation/threshold retries.
4. Export static batch-one FP32 with explicit 640 input and raw YOLOv8 detection output (no embedded NMS); pin an explicit opset after compatibility checks. Inspect the actual ONNX output signature before implementing the decoder. A typical 52-class YOLOv8 export is `[1, 4+52, N]` with box coordinates and class scores and no separate objectness channel, but assert the real layout/units rather than hard-coding an unverified assumption. Implement the inspected `yolov8-raw-v1` decoder and class-aware NMS outside the graph so candidate-retention thresholds remain adjustable. Preserve low-score review candidates, bound NMS input/output, and measure behavior on overlapping cards. Apply the same verified preprocessing/decoding/NMS to Python, ONNX and browser parity checks; do not apply a YOLO26 end-to-end decoder to this artifact. [Export settings](https://docs.ultralytics.com/modes/export)
5. Export the detection-only architecture directly. Do not import segmentation or text-processing modules. Optimize the baseline by testing FP16 and then representative-data INT8 calibration only when provider compatibility and card-identity accuracy remain acceptable.
6. Map model coordinates through letterbox and tile transforms back to the displayed photo. Clamp valid boxes, reject nonfinite/degenerate boxes, and normalize to `[0,1]`. Generate previews only for accepted candidates, with bounded thumbnail size.
7. Dispose input/output tensors, bitmaps, canvases, and temporary buffers. Include GPU/CPU allocation cleanup on errors and cancellation.

**Exit:** real browser inference returns valid review candidates on both providers, with coordinate parity and responsive controls.

### Phase 4 — card identity, uncertainty, and physical instances

- Map the pretrained model's 52 explicit class IDs to `Rank`/`Suit`. Keep wildcard marking/addition manual for the initial model. A future validated joker-capable replacement can map its learned joker class to `WILD`/`wild` without changing the domain type.
- Use separate candidate-retention and trusted-label thresholds tuned on development data. A score is not calibrated probability. Wrong confident identities are more harmful than an editable unknown.
- Keep low-confidence/unknown regions available for review instead of silently assigning a plausible identity. A blank rank/suit must remain `uncertain` and fail hand validation until completed.
- A fixed-class detector cannot promise to localize every unknown object: detections below the retention threshold may be absent entirely. Keep manual add available, and measure misses. Do not fabricate an unknown box where the model produced none. Complete but uncertain labels can remain editable suggestions; final hand confirmation is the user's review step, while missing fields and duplicate ordinary identities remain blocking validation errors.
- The initial raw export should expose per-class scores; verify that before using a top-two score margin to flag ambiguity. If a future export returns only one label/score per candidate, its decoder must disable unsupported margin logic rather than inventing scores. Use measured conflict signals in either case.
- Merge repeated tile detections only with evidence they describe the same physical instance. Conflicting labels on the same region become an uncertain candidate. Avoid class-agnostic suppression that erases genuinely overlapping cards.
- Two opposite indices may represent one card. Group detections according to the recorded annotation target; merge corner detections only when validated geometry establishes the shared physical card. There is no segmentation mask to rely on. Otherwise keep the ambiguity visible. Two distant boxes with the same identity must not be merged solely because ordinary duplicates are illegal.
- Test opposite corners, two distinct overlapping cards, erroneous same-label predictions on different cards, and multiple jokers with ground-truth physical IDs. Same-identity corner pairs left unmerged count as extra instances in automatic-recognition metrics; exclude/remove controls are recovery UX, not evidence that deduplication succeeded.
- Do not fill hidden identities from deck composition, assume exactly nine detected cards, or discard candidates merely to reach nine/ten. Support up to the existing 55-candidate review limit; a limit hit must be visible rather than silently truncating the scene.
- Keep raw detector capacity separate from that review limit. A 55-card scene can contain 110 exposed indices before tile duplicates. Record a sufficient raw top-K/candidate limit, consolidate same-instance evidence first, then enforce the 55-review-item cap with a visible truncation/retake message. Bound all intermediate candidates and tile passes to prevent unbounded CPU/memory work.
- Keep deterministic visual ordering for overlays/review. Preserve existing selection and legal-hand validation: exactly 9 or 10 selected cards, no duplicate ordinary cards, maximum three wildcards, unique generated domain IDs.
- Correcting one field must not make an incomplete card appear fully trusted. Validate rank and suit completeness when clearing uncertainty.

**Exit:** duplicate physical detections and identity conflicts are handled conservatively without bypassing the existing game input checks.

### Phase 5 — integrate the existing helper UX

1. Replace string-prefix progress inference in `CardPhotoRecognition` with stage-based copy: initial model download, preparing photo, reading cards, preparing review.
2. Keep tap-to-edit, thumbnails, include/exclude checkboxes, add/remove cards, numbered overlays, retry, and manual entry.
3. Distinguish asset-download failure, unsupported execution, timeout, image-decode failure, and no readable cards. Do not tell users to check their connection for an inference-only timeout.
4. Keep cancellation and manual entry reachable while loading/inferencing. New photo, start over, navigation, unmount, and switching to manual entry must cancel active work.
5. Handle an empty result with a useful retry/manual-entry state. Never suggest that nine unknown boxes constitute a recognized hand.
6. Replace the blanket 120-second behavior with separately bounded asset loading and inference, based on measured cold-load/device timings. Keep a final watchdog and permit retry without a page refresh.
7. Check `app/helper/page.tsx`: its photo component is currently hidden rather than always unmounted when moving to analysis/results. Explicitly deactivate or unmount recognition resources so the model does not compete with arrangement computation.
8. Keep product language focused on cards and review. Execution-provider details belong in development diagnostics; keep the accurate on-device privacy statement.

### Phase 6 — validate, switch, and remove Tesseract completely

Integrate behind a temporary internal development switch so both engines can be compared before cutover. Do not download or initialize both engines in the same user scan. After model/UI acceptance passes, perform the following cleanup on the release candidate; rerun the complete suite and removal checks to close Gate C before production release:

1. Make the selected pretrained card-trained YOLOv8n detector the sole production recognizer and remove the temporary engine selector.
2. Remove `tesseract.js` with npm and commit the resulting lockfile changes. Confirm unused Tesseract-only transitive packages are gone.
3. Delete `findCardRegions`, `readRank`, `readSuit`, silhouette/templates, `cornerSymbols`, and the OCR orchestration. Delete `lib/card-corner-recognition.ts` and imports once no consumers remain. Keep only image helpers needed by the new implementation.
4. Rewrite image tests; remove the Tesseract Node adapter import, `traineddata` downloads, OCR cache directory/chdir, and OCR-specific cancellation triggers. Preserve meaningful domain and cancellation coverage.
5. Keep `@napi-rs/canvas` only if it still supports image/preprocessing tests; do not remove a dependency solely because OCR used it.
6. Update README setup, first-scan downloads, browser fallback, actual limits, model preparation, licensing attribution, and test commands. Update AGENTS architecture/testing notes to match the completed implementation.
7. Search application/dependency/test/build sources for Tesseract, traineddata, tessdata, OCR workers/CDNs, and the old corner module. Historical discussion in this plan can remain; no executable references or dependency paths may remain.
8. Verify `npm ls tesseract.js tesseract.js-core` reports neither installed. Inspect fresh production browser network requests and emitted bundles for legacy OCR assets.
9. Rollback, if needed, restores a prior release through version control. The finished application contains no dormant Tesseract fallback. Unreadable scans fall back to review/manual entry.

## Acceptance checks and test strategy

The following are proposed engineering targets, not measurements or promises. Use the same held-out photos for old/new comparison and report every cohort. Gate C requires the targets below; a missed target is reported as a failed gate, not silently waived. Changes to targets require a documented product-scope decision outside routine implementation tuning.

| Area | Proposed release condition |
| --- | --- |
| Easy readable 9/10-card hands | At least 95% exact-hand identity/count correctness; no regression against the measured OCR baseline |
| Readable fanned/overlapping hands | At least 80% exact-hand correctness and fewer total manual corrections than baseline |
| Confident identity precision | At least 99% among accepted trusted identities; publish numerator/denominator and uncertainty coverage to prevent achieving this by rejecting nearly everything |
| Difficult/hidden identities | No requirement to infer invisible information; incorrect/ambiguous results stay reviewable and limits are documented |
| Negative images | No trusted cards in the initial negative corpus; report false candidates separately |
| Wildcards | Initial checkpoint has no verified joker class: preserve and test manual wildcard addition/correction; document that automatic joker recognition is unsupported |
| Warm scan latency | Initial target p95 ≤3 seconds WebGPU and ≤10 seconds WASM for a typical hand, including chosen extra passes, on named representative devices |
| Download | Initial target ≤15 MB compressed for required detector weights and ≤30 MB total initial recognition assets, excluding optional variants; measure actual transfer and initialization |
| Replacement compatibility | Same-contract alternate artifact/manifest fixtures validate model swapping and reject mismatches; no newly trained weights are required to test the boundary |
| Lifecycle | No stale result after cancellation; no unresolved request promises; no growing memory trend across at least 20 scan/reset cycles |
| Privacy/cost | No photo/tensor upload or paid inference request; only app-origin runtime/model downloads |
| Removal | No installed Tesseract package, OCR execution path, language data request, or OCR runtime bundle |

Metric definitions:

- **Exact-hand correctness:** on fully readable 9/10-card ordinary hands, compare the complete predicted identity multiset and physical count before any user edits. Ordering is irrelevant; misses, extras, unknown/blank identities, unmerged corners, and wrong labels all make that image incorrect. Do not score only trusted predictions while ignoring extra review candidates.
- **Trusted precision and coverage:** match predictions to ground-truth physical instances; measure correct trusted identities divided by all trusted predictions, counting unmatched/duplicate trusted boxes as incorrect. Also report trusted correct instances divided by all readable instances. Exact-hand gates still apply, so abstaining on nearly everything cannot pass.
- **Correction burden:** report per-image minimum card-level additions, identity edits (rank/suit together count as one edit), and removals/exclusions needed to reach the labeled hand. Count unknowns as needing edits and duplicate corners as needing removals. Report the three counts separately and their sum for both OCR and YOLO.
- **Joker/unknown cohorts:** report separately; a 52-class release intentionally needs manual joker entry and cannot claim fully automatic wildcard-hand accuracy. Hidden identities are excluded from readable-identity accuracy but visible-card counting errors are reported. For >10-card photos, evaluate all readable physical cards and the select-9/10 UX separately.
- **Latency/download:** report cold download/init and warm decode-to-review separately, with at least 30 timed warm scans per named representative device/provider. Download budgets include all required recognition JS/module/WASM/manifest/weight bytes; report both actual transfer and uncompressed sizes. Any optimized-first download followed by FP32 fallback must be included in a separate worst-case total. Memory reports include decode, tensors, and model/session allocations where observable.

A 100-image held-out corpus is enough for an initial decision, not a production-wide statistical guarantee. Report per-deck and per-condition sample counts, errors, and error intervals where practical. Test-set labels must never be used to choose thresholds, annotation policies, or training settings; if inspected failures drive retraining, retain them as regression fixtures and obtain a fresh independent test set for the next final evaluation.

Automated checks:

- Keep Node's built-in runner; no broad test framework migration is required.
- Pure tests cover class mapping, manifests, letterbox/inverse transforms, tile boundaries, EXIF orientation transforms, clipping, malformed outputs, output-layout validation, conflicting labels, duplicate suppression, uncertainty, card counts, wildcards, and IDs.
- Worker/client tests cover initialization failure, download abort, in-flight abort, worker/message errors, newer-photo supersession, Strict Mode cleanup, timeout, GPU-to-WASM fallback, and session disposal. Use controlled worker/runtime doubles for these lifecycle tests.
- Model-contract tests use controlled artifact/manifest fixtures to cover same-schema replacement without new training, changed class order with matching mapping, mismatched mapping/weights, unsupported decoder/schema, incompatible annotation policy, partial publication, and cached old assets after an active-version switch.
- Model integration tests use pinned assets and a small labeled fixture subset; verify Python/ONNX/browser semantic parity with tolerances. Keep network downloads outside ordinary unit tests and fail a required model check clearly if assets are missing, rather than silently skipping it.
- Keep synthetic generated cards for geometry and regression inputs, but do not tune a recognizer solely to those fonts. Move real model browser tests to a separate integration suite using a pinned headless-browser runner if the current tooling cannot execute them. Browser coverage is required even if Node inference succeeds.
- Retain and run `tests/helper-analysis-worker.test.mjs` to catch broken hand-to-analysis flow.

Manual browser checks on a production build:

- Desktop Chrome/Edge with actual WebGPU; a forced WASM path; current iPhone Safari and Android Chrome on real named devices. Record OS/browser versions and provider used, without assuming that browser branding guarantees GPU availability.
- Camera permission granted/denied/unavailable; uploaded JPEG/PNG, unsupported images, EXIF rotation, very large photos; bright/dark tables, clutter, blur, glare, portrait/landscape, overlap, and 9/10/>10-card photos.
- Cold asset load, cached repeat scan, network failure mid-download, missing/corrupt model, storage restrictions, GPU loss, and cancellation during each stage. Cached-model testing does not establish a fully offline app.
- Correct unknown/conflicting cards, select/exclude extras, add missed cards, mark wildcards, confirm, analyze nine cards, analyze ten with discard, edit the result, and start over.
- Confirm main `/` gameplay still works for two and six players, including the rotating ten-card discard and round continuation. Feedback behavior remains unchanged.

Required commands for each implementation change:

```bash
node --test tests/card-recognition.test.mjs
node --test tests/helper-analysis-worker.test.mjs
npm run lint
npm run build
```

Add explicit npm commands for pretrained model preparation, asset verification, model/browser integration checks, and corpus evaluation when those scripts exist. Document their pinned prerequisites and artifact paths. Do not add a training command or require a training dataset for this migration. Keep the image/model integration suite as a distinct required Gate C command and remove or replace the current OCR image-test command in README. Store benchmark CSV/JSON output outside tracked source by default. Existing unrelated lint failures must be reported separately; implementation must introduce no additional lint failures and must not suppress existing rules globally to manufacture a pass.

## Future custom-trained replacement — deferred

After the pretrained scanner is integrated and measured, a separate project can collect diverse card photos and train/fine-tune a replacement. Prefer the same YOLOv8n detection architecture, annotation target, preprocessing and raw-output contract for the simplest swap; then export new ONNX weights, publish a new versioned manifest/directory, run the replacement acceptance suite, and switch the active model configuration. Keep the previous model available for rollback. This requires no review UI or arrangement changes when the contract stays compatible.

Adding a trained joker class is a class-map change that needs validation. A future YOLO26 or another head/output format requires a supported new decoder and compatibility tests, so it must not be advertised as an unconditional file-only swap. Training data, augmentation, hardware, training scripts and training cost are outside the initial Tesseract-removal scope. If the first checkpoint misses an accuracy target, document that evidence and the proposed future improvement; do not silently expand this migration into a training project.

## Delivery units and definition of done

1. **Evidence and artifacts (Gates A/B):** pinned `mustafakemal0146/playing-cards-yolov8` source artifact, verified 52-class/box metadata, separate development/test photo manifests with physical IDs, OCR comparison, exact export recipe, ONNX/manifest, raw-output/NMS configuration and browser provider smoke proof. No custom training deliverables.
2. **Recognition runtime:** strict replacement contract, typed worker/client, preprocessing/postprocessing, provider fallback, asset/version checks, unit/contract tests. This can start with controlled fixtures while model work proceeds, but real integration waits for Gate B.
3. **Helper integration:** review UX, unknown/conflict handling, download/error/cancellation states, resource handoff to analysis. Keep production OCR available until release evidence passes.
4. **Removal and verification (Gate C):** final benchmark and device report, explicit acceptance checklist, uninstall/delete legacy recognition, updated tests/docs, production asset and network checks, documented model replacement/rollback procedure.

The migration is complete only when the selected pretrained `mustafakemal0146/playing-cards-yolov8` artifact runs locally on supported GPU/CPU browser paths, review and arrangement flows work, measured limitations are documented, the replacement contract is tested, and Tesseract is absent from dependencies, shipped code, and runtime requests. There must be no open-vocabulary, text-encoder, tokenizer, prompt-embedding, or segmentation dependency in the recognition pipeline. If the accuracy gates fail, record the pretrained model's limitation; do not silently introduce custom training, reintroduce YOLOE, or declare success based solely on replacing imports.

## Repository checks at plan creation

Only this plan was added; the scanner and dependencies remain unchanged.

- `node --test tests/card-recognition.test.mjs tests/helper-analysis-worker.test.mjs`: 13 passed.
- `npm run build`: passed.
- `npm run lint`: existing failures in untouched files: synchronous state update in `app/page.tsx:208`, explicit `any` in `components/GameTable.tsx:319`, and explicit `any` in `components/ScoreDisplay.tsx:57`; 17 additional warnings. Record these as baseline issues and resolve or track them separately when establishing a clean migration gate.
- The OCR image suite and real-device/model benchmarks have not been run for this documentation change. No claim of new-model recognition accuracy has been established.

## Primary references

- [YOLOv8 detection architecture and export support](https://docs.ultralytics.com/models/yolov8)
- [Selected pretrained card-recognition checkpoint](https://huggingface.co/mustafakemal0146/playing-cards-yolov8)
- [Ultralytics export options](https://docs.ultralytics.com/modes/export)
- [ONNX Runtime WebGPU setup](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [ONNX Runtime deployment and runtime assets](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- [ONNX Runtime threading, proxy, and asset-path configuration](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
