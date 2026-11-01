# Apple Silicon card-detector training pipeline

Status: YOLO26 preparation, resumable training, validation, dual-head ONNX export, numerical parity, and Python ONNX Runtime inference implemented. Candidate comparison, browser verification, physical-card acceptance, and release packaging remain pending. README.md describes executable commands and boundaries; the remaining sections below are the broader target plan.
Prepared: 2026-11-01.
Revised: 2026-11-01 — prioritize YOLO26n and compare against a fine-tuned YOLOv8n baseline.
Revised: 2026-11-01 — use supplied local version-4 exports; no dataset download or API key required.

## Summary

Build a reproducible local pipeline in this standalone Python project that uses the supplied labeled exports, trains YOLO26n as the primary replacement candidate, fine-tunes the pinned YOLOv8n card checkpoint as a baseline, evaluates both, and exports versioned ONNX replacements. Keep the unchanged pinned checkpoint as a third evaluation reference.

The supplied datasets support **52 ordinary cards**. Run the initial baseline with those classes; the goal of **52 ordinary cards plus one joker class** requires additional local labeled joker data before a 53-class training run can begin. Never claim joker recognition from these exports. Training will prefer Apple Silicon MPS, with CUDA and CPU options. The eventual pipeline packages the model and verification tools; live scanner replacement remains separate.

This is a newly authorized training workstream extending the custom-training work deferred in [the pretrained migration plan](../spec/yolo-card-recognition-plan.md). It does not replace that plan's scanner integration and release checks. See [README.md](README.md) for the scaffold's currently executable commands and pending stages.

## Implementation

### Dataset preparation

- Use the two supplied local exports of [Augmented Startups Playing Cards version 4](https://universe.roboflow.com/augmented-startups/playing-cards-ow27d/dataset/4), under `model-training/data/`:
  - YOLO26n: `Playing Cards.v4-yolov8n.yolo26/data.yaml` (exported January 16, 2026; annotation format YOLO26).
  - YOLOv8n: `Playing Cards.v4-fastmodel-resized640-aug3x.yolov8/data.yaml` (exported March 7, 2023; annotation format YOLOv8).
- Configure those paths in `configs/pipeline.json`; resolve paths relative to this Python project rather than the shell's working directory. No dataset downloader, Roboflow SDK, account, or API key is required. Missing inputs must produce an actionable local-path error, never a network fallback.
- Both supplied `data.yaml` files declare the same 52-class order and upstream Public Domain license. Each local export currently contains 21,203 training, 2,020 validation, and 1,010 test image/label pairs (24,233 total); the upstream README advertises 24,240. Record the discrepancy and audit completeness before full training rather than inventing missing samples.
- The supplied YAML split paths use `../train/images`, `../valid/images`, and `../test/images`. Generate prepared YAML with absolute paths to the actual directories inside each export; never depend on Ultralytics' working-directory heuristics or edit the original exports in place.
- Preserve upstream attribution and record source version, metadata/image hashes, label counts, and annotation policy. Never mix whole-card and corner-index annotations silently. Check that corresponding exports contain equivalent images, labels, and split membership before comparing architectures; if they differ, use one audited common prepared dataset for both rather than benchmarking different data.
- The exports already contain stretched 640px images, mirrored examples, and three-way augmentation. Additional augmentation cannot reverse those choices; record this provenance and avoid assuming the inputs are unaugmented originals.
- Preserve the existing checkpoint's ordinary class order. When local labeled joker data is available, append `JOKER` at ID 52, audit coverage and splits, and explicitly switch configuration to 53 classes. Current inspection deliberately rejects a 53-class declaration against the pinned 52-class exports.
- Use the same class mapping and frozen data splits for both architectures. Image-level card lists alone are not sufficient for this detector-training pipeline; retain box labels even though exact identities and physical counts are the main product metrics.
- Validate images, bounding boxes, missing labels, and class IDs. Detect duplicate images and augmented siblings across splits; keep related images together. Freeze the resulting train/validation/test manifests.
- Keep raw data, prepared datasets, checkpoints, and reports ignored by Git.

### Training and orchestration

- Extend the Python package in `model-training/src/ongdu_training` with real implementations of the scaffold's `prepare`, `train`, `export`, `evaluate`, `compare`, `package`, and `run` stage boundaries. `inspect`, `run --dry-run`, and `evaluate` for the pinned placeholder are implemented; remaining stages and evaluation of new candidates are pending. Training accepts `--model=yolo26n|yolov8n|all`; standalone training defaults to `yolo26n`, while `run` trains and compares both. Support resuming completed stages only when model, environment, data, and configuration fingerprints match.
- Provide an isolated Python 3.11 environment with a pinned, verified YOLO26-capable Ultralytics release and compatible PyTorch/ONNX dependencies. Do not keep 8.3.240 as the shared environment merely because it serialized the old checkpoint. Verify loading and inference of the pinned v8 checkpoint in the new environment before full training; preserve the original source-inspection metadata. Record resolved dependencies, hardware, seed, configuration, dataset fingerprint, and checkpoint hashes for every run.
- Initialize YOLO26n from a locally supplied official general-object-pretrained `data/yolo26n.pt`, with provenance and SHA-256 recorded before training. Train it on the configured class count; do not attempt to load the card-trained YOLOv8 checkpoint into the different architecture. No implicit weight download: reject missing local files before constructing an Ultralytics model.
- Initialize the YOLOv8n baseline from the existing hash-verified card checkpoint, supplied at `data/playing_cards_model_0_playing-cards-colab.pt`. Transfer compatible weights into its configured detection model and explicitly report which head parameters are newly initialized if adding a class. Keep architecture-specific checkpoints and run directories separate.
- Default to 640px images, batch 8, up to 100 epochs, patience 5, workers 0, and disk-backed data loading. Disable AMP on MPS. Provide configurable batch/device settings, a two-epoch smoke run, and checkpoint resume.
- Device selection: MPS on supported Apple Silicon, otherwise CUDA when available, otherwise CPU. Explicit device requests fail clearly when unavailable; training failures retain resumable state.
- Use modest rotation, perspective, lighting, scale, and mosaic augmentation. Disable mirrored text augmentation and mixup; close mosaic for the final ten epochs.
- Apply the same data, augmentation, seed, and epoch budget to both training candidates. Use the pinned trainer's supported automatic optimizer selection and record resolved optimizer/hyperparameters per model. Report actual epochs and wall-clock training time; early stopping and different pretraining make this a practical candidate comparison, not an architecture-only experiment.
- Save `best.pt`, `last.pt`, training curves, and machine-readable metrics. Downloads and training never run during the Next.js build.
- Keep the Python environment and dependency installation entirely inside `model-training`; the scaffold has no third-party runtime dependencies. Add and lock verified training dependencies when implementing ML stages, not in npm or root build hooks. Keep data, weights, environments, and `artifacts/` ignored by Git; `.vercelignore`, Next output tracing, TypeScript, ESLint, and Tailwind exclusions isolate this project from the web build. Only a separately accepted runtime ONNX package may later be copied into application assets.

### ONNX export and replacement contract

- Export each `best.pt` on CPU as **FP32 ONNX**, opset 17, fixed `[1,3,640,640]` input, batch 1. Validate this export path in the smoke run before committing to full training; do not silently change precision, opset, or output mode to bypass a failure.
- Export YOLOv8n with raw predictions and external NMS. Export both YOLO26n heads from the same trained checkpoint: the one-to-many head with external NMS and the one-to-one NMS-free head. Specify the head/export options explicitly for the pinned Ultralytics version; their meanings must not be assumed identical across versions or architectures. No export embeds NMS.
- Validate actual graph names, dtypes, class metadata, coordinate conventions, and output signatures. Expected raw outputs are `[1,56,8400]` for the initial 52-class run and `[1,57,8400]` after adding joker training; the YOLO26 NMS-free output is expected to be `[1,300,6]` containing box coordinates, score, and class ID. Reject unexpected signatures rather than routing them through a guessed decoder.
- Use the existing RGB letterbox preprocessing contract, including padding 114 and inverse box transforms.
- Extend `lib/card-detector/contract.ts` with an explicit versioned 53-class contract supporting `WILD`/`wild` and distinct decoder identifiers for v8 raw, v26 raw, and v26 NMS-free outputs. Normalize them into the same detection representation for evaluation. Preserve acceptance of existing 52-class manifests and rejection of malformed mappings; a new architecture is not an unconditional weights-only swap.
- Package immutable `detector.onnx`, class mapping, manifest, training provenance, attribution, graph contract, and evaluation reports. Generate asset hashes from actual bytes.
- Keep candidate packages separate from active application assets. A failed candidate remains inspectable but cannot be marked accepted.

## Evaluation and acceptance

- Compare the unchanged pinned YOLOv8n model, the fine-tuned YOLOv8n baseline, and both YOLO26n export modes on the same frozen public splits. Use identical preprocessing and shared downstream physical-card grouping; apply architecture-appropriate decoding/NMS. Select model, export mode, confidence thresholds, and NMS settings using validation data only, then freeze them before final test evaluation.
- Report exact-image card identity/count correctness, card-level additions/edits/removals needed for correction, ordinary-card mAP50–95, precision/recall, per-class results, confusion matrix, misses, extras, model size, and latency. Count duplicate detections as extras and multiple physical jokers separately. Mark joker metrics unsupported for the current local data; report them separately only after labeled joker data is added. Box precision is a diagnostic rather than the sole selection criterion.
- Rank validation candidates by exact-image identity/count correctness, then lower correction burden, then lower warm WASM p95 latency, then smaller ONNX size. Use a fixed lexical candidate ID as the final tie-breaker. Publish all comparisons, including whether YOLO26 actually beats fine-tuned v8; do not prefer an architecture based on its version number.
- Mark detection improvement only if ordinary-card mAP50–95 improves over the unchanged pinned model by at least one absolute percentage point, with no regression in ordinary-only exact-image identity/count correctness or correction burden. Report joker capability separately; adding a class alone does not pass the improvement gate.
- Verify PyTorch/ONNX output parity for each architecture and head with documented numerical tolerances, and compare final detections. Compare matching heads; do not expect raw and NMS-free tensors to match each other.
- Add an isolated browser verification harness using pinned ONNX Runtime Web: WASM is required; WebGPU is tested where available. Record actual providers and distinguish unavailable hardware from passing checks.
- The author's linked project identifies Augmented Startups' `playing-cards-ow27d` dataset as the original source, but the precise training version/split is unconfirmed. Audit public candidates for overlap with that source. Public test results are preliminary evidence; real-hand accuracy and mobile performance remain unverified until independent photos and named devices are tested. Public images containing only two or three cards do not establish 9/10-card hand accuracy.
- Package the validation-selected candidate with its final test report. If the improvement gate or required compatibility checks fail, label it experimental and leave the active model unchanged; do not choose another model by inspecting final test results. New tuning requires a fresh independent test set for a new acceptance claim.
- ONNX provides the portable artifact; universal hardware acceleration is not assumed.

## Tests and delivery

- Add focused tests for class remapping, joker mapping, corrupt labels, split leakage, per-architecture stage resume, hashes, both output layouts, decoder/manifest mismatches, deterministic candidate selection, parity failures, and rejection of failed packages. Verify NMS-free outputs do not receive an unintended second NMS pass.
- Once ML stages are implemented and local weights supplied, run real MPS smoke training for both architectures and export/evaluate all three trained-model variants before the balanced comparison run. Verify each export in the WASM harness; measure WebGPU where available, recording browser/device versions, warm end-to-end p50/p95, initialization time, and model size.
- Run existing detector-contract and recognition tests, `npm run lint`, and `npm run build`; report unrelated failures separately.
- Document local Python setup, local data/weight paths, one-command execution, interrupted-run recovery, custom-data import, and interpretation of acceptance reports.
- Update the previous migration documentation to identify this as the newly authorized training workstream.

## Assumptions and defaults

- One joker class will cover all joker designs once labeled data is available; current local training inputs support 52 ordinary cards. Game rules remain unchanged.
- Use public data first. Independent real-hand validation is required before claiming app-level improvement.
- The supplied local data is the default; no dataset download or credentials are required. Local pretrained weight files are a separate prerequisite for actual training.
- The default comparison uses nano models at 640px and two training runs. YOLO26n is the primary challenger; fine-tuned YOLOv8n is the baseline. Larger models and hyperparameter sweeps remain outside this delivery.
- Published general-object benchmarks motivate testing YOLO26, but do not establish card recognition gains or browser speed. The saved plan does not claim the newer model will win.
- No hosted training, inference service, automatic scanner cutover, or claim of superior detection without measured results.

## Technical references

- [Ultralytics training and Apple Silicon MPS support](https://docs.ultralytics.com/modes/train)
- [Ultralytics model export](https://docs.ultralytics.com/modes/export)
- [YOLO26 architecture, heads, and export options](https://docs.ultralytics.com/models/yolo26)
- [Ultralytics YOLO26 versus YOLOv8 comparison](https://docs.ultralytics.com/compare/yolo26-vs-yolov8)
- [Roboflow dataset export](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data)
- [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [Pinned base-model repository](https://huggingface.co/mustafakemal0146/playing-cards-yolov8)
- [Base-model author's project and dataset reference](https://github.com/MustafaKemal0146/kart-tanima)
