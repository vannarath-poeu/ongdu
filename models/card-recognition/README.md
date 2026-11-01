# Card detector migration artifacts

Implementation status: YOLO26 epoch-4 browser integration and desktop Chrome WASM checks completed. Independent hand accuracy, actual WebGPU execution, mobile-device benchmarks, and production acceptance remain pending.
The default photo scanner at `/helper` uses the frozen experimental YOLO26 epoch-4 model; its verified graph and manifest are under `public/models/card-recognition/yolo26n-epoch4-d7f58ee5-single-deck-v1/`. Desktop Chrome WASM and GPU-to-WASM fallback are tested; production acceptance, actual WebGPU execution, mobile devices and independent hand accuracy remain open.

The selected checkpoint is pinned in `source-inspection.json`, including its SHA-256,
byte length, actual serialized class order and referenced Python globals. The inspection
uses Python's standard-library `pickletools`; it does not execute the checkpoint pickle.
The extracted class mapping is in `classes.json`. Never sort these entries at runtime.

Reproduce with Python 3.9 or later (no external packages):

```sh
python3 scripts/card-recognition/inspect_checkpoint.py --download --checkpoint /tmp/ongdu-cards.pt --output /tmp/ongdu-source-inspection.json
```

Omit `--download` to inspect an already downloaded checkpoint. Downloads are explicit,
hash checked, size bounded and never run during `npm run build`. Compare the output
with the checked-in report before preparing any export.

The pinned file statically references `ultralytics.nn.tasks.DetectionModel`, a 52-class
head, width multiplier 0.25 and depth multiplier 0.33, with serialized Ultralytics
version 8.3.240 and image size 640. This is evidence consistent with YOLOv8n detection;
it is not a runtime forward-pass or export verification. The uploader advertises MIT
in repository metadata, while the checkpoint embeds an AGPL-3.0 notice. Preserve both
provenance records and upstream notices when packaging; no license is reassigned here.
Original training-split provenance is unknown.

Still needed before final decoder/integration:

- Runtime architecture verification using an isolated, pinned Python export environment.
- Development photos to establish whether boxes target card faces or corner indices.
- Human-labeled, licensed, independent 100-image held-out corpus plus separate tuning photos.
- ONNX export, exact output contract, parity report, measured thresholds and grouping policy.
- Exact tested ONNX Runtime Web version and same-build local WASM/module assets.
- Real browser WebGPU/WASM smoke checks, named-device latency/memory and accuracy reports.

Do not create a production manifest by guessing any of these fields. The contract
validator requires an explicit supported decoder and annotation/grouping policy.
The default adapter is YOLO26 raw output with the single-deck identity merge policy. The current boundary deliberately supports only the
initial FP32 52-class baseline. Joker/optimized exports need their own validation work.
An asset hash must be checked against actual bytes before constructing a session.

Run the independent contract checks with:

```sh
node --test tests/card-detector-contract.test.mjs tests/card-recognition.test.mjs tests/helper-analysis-worker.test.mjs
```

See `spec/yolo-card-recognition-plan.md` for release conditions. Tesseract removal is
after candidate acceptance, not a prerequisite to measuring the candidate.
