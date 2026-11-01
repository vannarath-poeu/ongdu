# Ongdu model training

Standalone Python project for the [end-to-end training plan](card-detector-training-pipeline.md).
It is independent of npm, Next.js, and the deployed application.

**Current status: scaffold plus placeholder evaluation.** Local dataset inspection,
execution planning, and the pinned YOLOv8n baseline benchmark work. Training, general
preparation, export, candidate comparison, and packaging remain unimplemented.
No model has been trained here.

## Local data

No dataset download, account, API key, or Roboflow SDK is required. The supplied exports
stay local under `data/` and are excluded from Git:

| Model | Local export | Source |
| --- | --- | --- |
| YOLO26n | `data/Playing Cards.v4-yolov8n.yolo26/` | Playing Cards v4, YOLO26 format |
| YOLOv8n | `data/Playing Cards.v4-fastmodel-resized640-aug3x.yolov8/` | Playing Cards v4, YOLOv8 format |

Both are exports of [Augmented Startups Playing Cards v4](https://universe.roboflow.com/augmented-startups/playing-cards-ow27d/dataset/4),
declared Public Domain by the included upstream notices. Preserve those notices locally.
Each has 21,203 training, 2,020 validation, and 1,010 test image/label pairs.
Both contain **52 classes and no joker class**. Joker training needs additional labeled
local data; the initial baseline can run with ordinary cards only.

The README's advertised 24,240-image total differs from the 24,233 local pairs. Audit
that difference and verify the two exports' image/label equivalence before full training.
Both already contain offline augmentation and stretched 640px images. The source YAML's
`../train/images` paths need normalization during the future prepare stage; do not pass
them blindly to a trainer or alter the original data in place.

## Setup and working commands

Use [uv](https://docs.astral.sh/uv/getting-started/installation/) to manage Python and
the project environment. uv is already installed on this machine. From the repository root:

```sh
cd model-training
uv sync --locked
uv run --locked ongdu-training inspect
uv run --locked ongdu-training inspect --check-labels
uv run --locked ongdu-training run --dry-run
```

The `.python-version` selects Python 3.11; uv can provision it if needed. `uv.lock`
locks the project and optional evaluation dependencies. Base setup does not install
PyTorch or Ultralytics. Python/build tooling setup may need network access; dataset
inspection does not. No virtual-environment activation is necessary. The environment
stays in the gitignored `.venv/` directory. To change dependencies intentionally, update
`pyproject.toml`, run `uv lock`, and retain the updated lockfile.

You can also run directly without installing anything:

```sh
cd model-training
PYTHONPATH=src python3 -m ongdu_training inspect
PYTHONPATH=src python3 -m ongdu_training run --dry-run --model yolo26n
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

`configs/pipeline.json` selects the local export for each model and contains the balanced
training defaults. Configured relative paths resolve from this project, regardless of
the working directory. `inspect` checks split inventory, image/label pairing, and pinned
export metadata; `--check-labels` additionally validates every annotation's class ID and
normalized coordinates. This is not yet an image-decoding, leakage, or accuracy audit.
Metadata hashes identify these exact exports; a changed hash requires an explicit audit
before updating the config. `run --dry-run` prints future stages, input paths, weight
availability, and export modes without creating artifacts or contacting the network.

## Pipeline implementation boundaries

The CLI reserves `prepare`, `train`, `export`, `evaluate`, `compare`, `package`, and `run`.
Calling an unfinished stage exits with status 2, rather than pretending a model was built.
Implement them in the order described in the plan, with verified and locked ML dependencies.

## Benchmark the placeholder model

Install the locked evaluation dependencies and run against the local checkpoint:

```sh
cd model-training
uv sync --locked --extra eval
uv run --locked --extra eval ongdu-training evaluate
```

Keep `--extra eval` on evaluation commands so uv retains the optional ML dependencies
when synchronizing. For a first Apple Silicon check, add `--device mps --limit 20`;
remove `--limit 20` for the full validation split. Use `--device cpu` if MPS is unavailable.

The eval extra pins Ultralytics 8.3.240, PyTorch 2.8.0, and torchvision 0.23.0 for the
existing checkpoint. It is separate from future YOLO26 training tooling and never
installed by npm or the web build. Package installation needs package-index access;
evaluation uses local data and weights without downloading a model or dataset.

The verified placeholder checkpoint is at
`data/playing_cards_model_0_playing-cards-colab.pt` (gitignored), so no `--weights`
argument is needed. On another checkout, supply this file locally or use
`--weights /local/path/model.pt`. The evaluator verifies its SHA-256
against `../models/card-recognition/source-inspection.json`, then checks class order.
Other weights are intentionally rejected by this baseline-only command.

```sh
# Fast smoke check; sorted first 20 images, not a representative benchmark:
uv run --locked --extra eval ongdu-training evaluate --limit 20

# Full validation split (2,020 images); CPU is the default:
uv run --locked --extra eval ongdu-training evaluate --device mps --batch 4

# Reserved test split (1,010 images), for a final benchmark after settings are frozen:
uv run --locked --extra eval ongdu-training evaluate --split test --output artifacts/evaluations/placeholder-test
```

Each run creates a new directory under `artifacts/evaluations/`, with `report.json`,
an image/label hash manifest, normalized dataset paths, and Ultralytics validation plots
(including precision-recall curves and confusion matrices). An existing output directory
is never overwritten. Original images and labels are referenced through a local symlink
view so validator caches stay in the run directory. This requires symlink support.
An additional `metrics.json` snapshot is saved at validation completion, before final
report assembly, so metrics survive a later reporting error.

The JSON includes **precision, recall, mAP50, mAP50–95, per-class metrics, image/box
counts, timing, checkpoint provenance, runtime versions, and evaluation settings**.
Classes absent from evaluated ground truth have null per-class metrics. Scores are
fractions from 0 to 1. Precision/recall use the validator's max-F1 operating point;
`conf=0.001` is the candidate floor for AP calculation, not a suggested app threshold.

These measure **annotated box detection**, not exact 9/10-card hand accuracy or physical
card counting. The original training split is unconfirmed and may overlap this source.
There are no joker labels, and Python timing does not establish browser performance.
Use validation data for tuning and preserve the test split for the final comparison.

Future training uses these local files, excluded from Git:

```text
data/yolo26n.pt
data/playing_cards_model_0_playing-cards-colab.pt
```

Missing files must fail before model construction; no implicit weight downloads are allowed.
Keep the existing YOLOv8 checkpoint hash/provenance in `../models/card-recognition/`.
Generated datasets, checkpoints, reports, and candidate packages belong in `artifacts/`.
No command in this scaffold publishes a model or switches the app's scanner.

## Web deployment isolation

- The root npm install/build scripts do not invoke Python or this project.
- `.vercelignore` excludes the entire tree from Vercel CLI uploads. Git deployments may
  still check out the small tracked scaffold; datasets, weights, and generated output are
  not committed, and no Python build/install command is configured for this Next.js app.
- Next.js output tracing excludes `model-training`; TypeScript, ESLint, and Tailwind also
  exclude it from their input scans. The project is outside `app/`, `public/`, and `api/`.
- Only separately verified ONNX runtime assets may later be copied into application assets.
  Do not import Python project files or raw datasets into the web application.

Check isolation after a production build by inspecting `.next/**/*.nft.json` for any
resolved file path under `model-training`. The dataset files and Python environment
must remain absent from tracked files and deployment traces.
