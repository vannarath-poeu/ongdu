# Ongdu YOLO26 card detector

Standalone Python 3.11 project for local **YOLO26n training → validation → FP32 ONNX → ONNX Runtime inference**. It is isolated from npm and Next.js. Commands never publish or activate a scanner model.

The implemented path supports the supplied **52 ordinary-card classes**. There are no joker labels. Runtime packages remain experimental: public box metrics and numerical parity do not establish physical-card counting, exact 9/10-card accuracy, browser compatibility, or improvement over the existing detector.

## Setup

```sh
uv sync --locked --extra train
uv run --locked --extra train ongdu-training inspect --model yolo26n --check-labels
uv run --locked --extra train ongdu-training run --dry-run --model yolo26n
```

The train extra locks Ultralytics 8.4.197, PyTorch 2.8.0, torchvision 0.23.0, ONNX 1.19.1, ONNX Runtime 1.23.2, and ONNXScript 0.5.6. Keep `--extra train` on uv commands so synchronization retains the ML environment. Base inspection needs no ML dependencies. Installation needs network access; pipeline execution uses local inputs and disables Ultralytics dependency auto-installation and implicit weight downloads.

Supply these local files (ignored by Git):

```text
data/Playing Cards.v4-yolov8n.yolo26/
data/yolo26n.pt
```

The checkpoint must match the official Ultralytics download recorded in [configs/yolo26n-source.json](configs/yolo26n-source.json). Download it explicitly if absent:

```sh
curl -fL https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.pt -o data/yolo26n.pt
```

The local datasets are [Augmented Startups Playing Cards v4](https://universe.roboflow.com/augmented-startups/playing-cards-ow27d/dataset/4), declared Public Domain by the included notices. Each supplied export has 21,203 training, 2,020 validation and 1,010 test pairs (24,233 total), seven fewer than the advertised 24,240. No missing samples are invented. Upstream 640px stretching, mirrored text and offline augmentation are already baked in.

## Train through ONNX

First verify the entire path with two epochs and 32 images per split:

```sh
uv run --locked --extra train ongdu-training run --smoke --device auto --output artifacts/yolo26-smoke
```

Then run full training:

```sh
uv run --locked --extra train ongdu-training run --device auto --output artifacts/yolo26-full
```

Each output directory must be new. The full command prepares the data, trains up to 100 epochs with patience 5, validates on the validation split, exports both heads, and verifies ONNX Runtime parity against PyTorch on three validation images. `--epochs N` and `--batch N` override defaults. The smoke subset checks execution only; its accuracy is not a benchmark.

Auto selects Metal/MPS, then CUDA, then CPU. Explicit unavailable accelerators fail clearly. On this Mac sandboxed processes cannot see Metal; execute training with the necessary host permissions rather than silently benchmarking CPU. Defaults are 640px, batch 8, seed 42, workers 0, AMP off, disk-backed loading, modest geometry/color augmentation, and no additional mirroring or mixup. Full runs can take many hours; keep the Mac awake and connected to power.

Artifacts:

```text
artifacts/yolo26-full/
  prepared/manifest.json          # frozen image/label hashes, class order, split audit
  prepared/dataset.yaml          # absolute paths into an isolated symlink view
  training/training.json         # source/data/environment/options and outcome
  training/fit/weights/best.pt
  training/fit/weights/last.pt
  training/fit/results.csv
  evaluation/report.json         # validation box precision, recall, AP and per-class metrics
  onnx/raw/detector.onnx
  onnx/raw/manifest.json
  onnx/nms-free/detector.onnx
  onnx/nms-free/manifest.json
  run.json                       # written only when every stage succeeds
```

Preparation validates labels and image decoding, hashes all inputs, and excludes cross-split exact duplicates and known `.rf.` augmentation siblings with test > validation > training precedence. Source files are untouched; trainer caches stay in the prepared view. This does not prove that all perceptual or capture-session duplicates are absent. The supplied filenames/hashes have no detected cross-split overlap. Notices and provenance are preserved. Training/export recheck hashes and split membership to reject modified prepared data.

## ONNX Runtime inference

```sh
uv run --locked --extra train ongdu-training predict \
  --manifest artifacts/yolo26-full/onnx/nms-free/manifest.json \
  --image /absolute/path/to/cards.jpg --confidence 0.25
```

The runtime verifies model bytes and the manifest's graph names, FP32 dtypes, signatures and decoder before execution. It uses CPUExecutionProvider, EXIF orientation, RGB bilinear letterbox with padding 114, round-half-up dimensions, normalization by 255, and inverse transforms into source-image coordinates. Output JSON contains source-box detections and timing, without deduplicating physical cards.

Exports are fixed `[1,3,640,640]`, FP32, opset 17, batch 1, without embedded NMS:

| Mode | Ultralytics 8.4.197 option | Output | Runtime processing |
| --- | --- | --- | --- |
| raw | `nms=None` | `[1,56,8400]`, xywh and 52 class scores | confidence filter and class-aware NMS |
| nms-free | `nms=False` | `[1,300,6]`, xyxy/score/class ID | confidence filter; no second NMS |

See the [official end-to-end guide](https://docs.ultralytics.com/guides/end2end-detection). Older releases' end2end examples are not the interface pinned here. Both exports reload the same training checkpoint independently to preserve both heads.

Parity uses full raw tensors with `atol=rtol=0.001`. NMS-free verification compares every sorted score (`atol=0.0001`, `rtol=0.001`) and matches class/box sets above confidence 0.25 with pixel `atol=0.001`, `rtol=0.001`; tied low-score top-k coordinates may differ. Both modes additionally compare decoded detections. The manifest records the method, tolerances, actual errors, checkpoint/data hashes and resolved environment. A failed export has no verified manifest.

## Separate stages and recovery

```sh
uv run --locked --extra train ongdu-training prepare --output artifacts/prepared
uv run --locked --extra train ongdu-training train --prepared artifacts/prepared --output artifacts/training

# After interruption, use the SAME options, paths, environment and original epoch budget:
uv run --locked --extra train ongdu-training train --prepared artifacts/prepared --output artifacts/training --resume

uv run --locked --extra train ongdu-training evaluate \
  --model yolo26n --weights artifacts/training/fit/weights/best.pt \
  --prepared artifacts/prepared --output artifacts/evaluation

uv run --locked --extra train ongdu-training export \
  --weights artifacts/training/fit/weights/best.pt --prepared artifacts/prepared \
  --output artifacts/onnx
```

An interrupted trainer records its failure and retains resumable checkpoints when available. Resume rejects changed source weights, data, options or environment. Completed Ultralytics checkpoints have stripped optimizer state and are not resumable training checkpoints. Run does not auto-skip stages; use the separate commands after a later-stage failure. A new evaluation/export directory avoids overwriting evidence.

Evaluation uses validation by default. Use `--split test` only after freezing model/head/threshold choices. Evaluate without `--prepared` retains the hash-verified YOLOv8 placeholder benchmark using `data/playing_cards_model_0_playing-cards-colab.pt` and `../models/card-recognition/source-inspection.json`; `--limit N` is supported only for that benchmark. Its checkpoint also loads and validates in the new pinned environment. A fine-tuned YOLOv8 training entry point remains available, but the end-to-end orchestrator and dual-head exporter are YOLO26-specific.

## Compare the live OCR with the placeholder

The `compare-ocr` command runs the application's actual `recognizeCardPhoto` function through the same Node canvas adapter as its existing image tests. It does not copy or rewrite the rank/suit heuristics. This requires the parent application's installed npm dependencies and a Node version supporting TypeScript imports. Source, adapter, npm lockfile, language-data and checkpoint hashes are recorded with the report so later edits cannot silently change the benchmark.

Download the English language data once, explicitly, into the ignored local cache:

```sh
mkdir -p artifacts/ocr-cache
curl -fL https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz -o artifacts/ocr-cache/eng.traineddata.gz
uv run --locked python -c 'import gzip; from pathlib import Path; p=Path("artifacts/ocr-cache"); (p/"eng.traineddata").write_bytes(gzip.decompress((p/"eng.traineddata.gz").read_bytes()))'
```

Then run both systems on exactly the same seeded sample of validation images:

```sh
uv run --locked --extra train ongdu-training compare-ocr \
  --limit 100 --seed 42 --output artifacts/ocr-vs-placeholder-100

# All 2,020 validation images; test data remains reserved:
uv run --locked --extra train ongdu-training compare-ocr \
  --all-images --output artifacts/ocr-vs-placeholder-full
```

The default is 100 randomly sampled images, seed 42, YOLO confidence 0.25, IoU 0.7 and a 120-second OCR deadline per image. Both systems process original full images without ground-truth crops. Evaluation runs sequentially on CPU to avoid taking the training GPU. Each OCR call creates a worker as the app does; timed-out child processes are killed. Failures count as empty predictions and remain in accuracy denominators. Per-image outputs flush to `predictions.jsonl`; a completed run writes `report.json`, with `images.json` and `provenance.json` preserving the paired inputs and environment. Existing output directories are never overwritten.

Primary metrics are exact **unique identity sets per image**, unique-identity precision/recall, and missing/extra identities. Multiple source boxes may refer to opposite corners of one card, so both label and prediction sets collapse repeated identities symmetrically. Duplicate predictions, unknown OCR outputs and scan errors are reported separately. Consequently exact-set scores can be high even when a review screen needs duplicate removal; this is not physical-card counting, box mAP, correction burden, or exact 9/10-card hand accuracy. The source may overlap the placeholder's training data, so this is an in-domain diagnostic. No joker recognition is measured.

Timing is diagnostic only: OCR includes Node startup and per-photo worker initialization, whereas warmed YOLO excludes model initialization. Node canvas/fonts can differ from browsers. Do not present these numbers as browser latency or a fair cold-start speed ratio.

## Verification and remaining acceptance work

```sh
uv run --locked --extra train python -m unittest discover -s tests -v
```

Tests cover data leakage, immutable split hashes, RGB letterbox/inverse geometry, raw NMS, NMS-free suppression avoidance, graph/decoder mismatches, corrupt model hashes, parity failures and baseline reporting. Real CPU and Metal smoke runs exercise the ML path separately from mocked unit tests.

Compare and release package deliberately remain unavailable. The broader [training plan](card-detector-training-pipeline.md) still requires fair architecture comparison, physical-card grouping, independent hand photos, browser WASM/WebGPU verification and latency, final test evaluation, and improvement gates before app integration. Python ONNX Runtime parity does not establish ONNX Runtime Web compatibility. Current manifests are local experimental runtime contracts, not the application's accepted model-manifest schema.

Datasets, weights, environments and artifacts stay ignored. No npm or Next.js build hook invokes Python. Preserve the existing .vercelignore, TypeScript/ESLint/Tailwind and Next output-tracing exclusions; only an accepted model package may later enter application assets.
