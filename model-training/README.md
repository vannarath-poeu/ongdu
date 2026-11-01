# Ongdu model training

Standalone Python project for the [end-to-end training plan](card-detector-training-pipeline.md).
It is independent of npm, Next.js, and the deployed application.

**Current status: scaffold.** Local dataset inspection and execution planning work.
Training, preparation, export, evaluation, comparison, and packaging have CLI boundaries
but intentionally return an error until implemented. No model has been trained here.

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

Use Python 3.11 or newer. From the repository root:

```sh
cd model-training
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
ongdu-training inspect
ongdu-training inspect --check-labels
ongdu-training run --dry-run
```

Editable installation resolves setuptools 68+ as build tooling. The scaffold has no
third-party runtime dependencies and does not install PyTorch or Ultralytics. Package
installation may need package-index access for build tooling; dataset inspection does not.
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

Future training uses these local files, excluded from Git:

```text
weights/yolo26n.pt
weights/playing_cards_model_0_playing-cards-colab.pt
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
