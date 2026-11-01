"""Benchmark the pinned placeholder checkpoint against a supplied local export."""

from datetime import datetime, timezone
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import platform
import uuid

from .pipeline import IMAGE_SUFFIXES, inspect_dataset, local_path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_placeholder(root, weights):
    provenance = json.loads((root.parent / "models/card-recognition/source-inspection.json").read_text())
    if not weights.is_file():
        raise ValueError("Placeholder weights missing: {}. Supply --weights /local/path/model.pt; no download is performed.".format(weights))
    if sha256(weights) != provenance["source"]["sha256"]:
        raise ValueError("Checkpoint SHA-256 differs from the pinned placeholder model")
    return provenance


def metric_report(metrics, names):
    """Use evaluated class indices, not .maps which fills absent classes with mean AP."""
    box = metrics.box
    evaluated = {int(class_id): index for index, class_id in enumerate(box.ap_class_index)}
    per_class = []
    for class_id, name in enumerate(names):
        index = evaluated.get(class_id)
        values = None if index is None else {
            "precision": float(box.p[index]), "recall": float(box.r[index]),
            "map50": float(box.ap50[index]), "map50_95": float(box.ap[index]),
        }
        per_class.append({"class_id": class_id, "label": name, "metrics": values})
    return {
        "precision": float(box.mp), "recall": float(box.mr),
        "map50": float(box.map50), "map50_95": float(box.map),
        "per_class": per_class,
        "speed_ms_per_image": {key: float(value) for key, value in metrics.speed.items()},
    }


def evaluate_placeholder(root, config, *, weights=None, split="val", device="cpu",
                         batch=4, limit=None, output=None):
    if split not in ("val", "test"):
        raise ValueError("Only val and test splits are supported")
    if batch < 1 or (limit is not None and limit < 1):
        raise ValueError("Batch and image limit must be positive integers")
    weights = local_path(root, weights or config["weights"]["yolov8n"])
    provenance = verify_placeholder(root, weights)
    inventory = inspect_dataset(root, config, "yolov8n", check_labels=True)
    dataset = Path(inventory["path"])
    source_split = "valid" if split == "val" else "test"
    images = sorted(p for p in (dataset / source_split / "images").iterdir()
                    if p.suffix.lower() in IMAGE_SUFFIXES)
    total_images = len(images)
    if limit is not None:
        images = images[:limit]

    # Missing dependencies are actionable; inspection/dry-run do not need this extra.
    os.environ["YOLO_CONFIG_DIR"] = str(local_path(root, config["output"]) / ".ultralytics")
    os.environ["YOLO_OFFLINE"] = "true"
    try:
        import torch
        from ultralytics import YOLO, settings
    except ImportError as error:
        raise ValueError("Evaluation dependencies missing. From model-training run: uv sync --locked --extra eval") from error
    if metadata.version("ultralytics") != "8.3.240":
        raise ValueError("Placeholder evaluation requires ultralytics==8.3.240; run uv sync --locked --extra eval")
    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "0" if torch.cuda.is_available() else "cpu"
    if device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS is unavailable; use --device cpu")
    if device == "0" and not torch.cuda.is_available():
        raise ValueError("CUDA is unavailable; use --device cpu")

    names = [entry["label"] for entry in provenance["classes"]]
    # Local path and verified bytes prevent Ultralytics' named-weight download fallback.
    settings.update({"sync": False})
    model = YOLO(str(weights), task="detect")
    actual_names = model.names
    actual_names = [actual_names[i] for i in range(len(actual_names))] if isinstance(actual_names, dict) else list(actual_names)
    if actual_names != names:
        raise ValueError("Checkpoint class order differs from the pinned dataset mapping")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory = local_path(root, output or "{}/evaluations/placeholder-{}-{}".format(
        config["output"], stamp, uuid.uuid4().hex[:8]))
    directory.mkdir(parents=True, exist_ok=False)
    selected = []
    # Isolate label caches and all validator outputs from the original exports.
    for image in images:
        label = dataset / source_split / "labels" / (image.stem + ".txt")
        selected.append({"image": image.name, "image_sha256": sha256(image),
                         "label_sha256": sha256(label),
                         "boxes": len([line for line in label.read_text().splitlines() if line.strip()])})
        for folder, source in (("images", image), ("labels", label)):
            target = directory / "dataset" / source_split / folder / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(source)
    (directory / "images.json").write_text(json.dumps(selected, indent=2) + "\n")
    # JSON is valid YAML. Absolute paths fix the supplied export's ../ split paths.
    # The loader requires a train key even for validation. No training is invoked.
    prepared = {"path": str(directory / "dataset"), "nc": len(names), "names": names,
                "val": str(directory / "dataset" / source_split / "images"),
                "test": str(directory / "dataset" / source_split / "images"),
                "train": str(directory / "dataset" / source_split / "images")}
    data_file = directory / "dataset.yaml"
    data_file.write_text(json.dumps(prepared, indent=2) + "\n")
    arguments = {"data": str(data_file), "split": split, "imgsz": 640, "batch": batch,
                 "device": device, "workers": 0, "half": False, "conf": 0.001,
                 "iou": 0.7, "max_det": 300, "augment": False, "rect": False,
                 "plots": True, "save_json": False, "save_txt": False,
                 "project": str(directory), "name": "validation", "exist_ok": False,
                 "seed": config["training"]["seed"]}
    completed = {}

    def capture_validation(validator):
        # Ultralytics keeps its validator local to val(); it is not model.validator.
        completed.update(images_seen=int(validator.seen), results=metric_report(validator.metrics, names))
        # Persist metrics before assembling the final provenance report.
        (directory / "metrics.json").write_text(json.dumps(completed, indent=2, allow_nan=False) + "\n")

    model.add_callback("on_val_end", capture_validation)
    model.val(**arguments)
    if not completed:
        raise RuntimeError("Validation did not provide completion metrics")
    if completed["images_seen"] != len(images):
        raise RuntimeError("Validator evaluated {} of {} selected images; inspect corrupt/missing inputs before benchmarking".format(
            completed["images_seen"], len(images)))
    report = {
        "schema_version": 1, "model": "pinned-placeholder-yolov8n", "created_at": stamp,
        "checkpoint": {"path": str(weights), **provenance["source"]},
        "dataset": {"path": str(dataset), "source": config["dataset_source"],
                    "metadata_sha256": inventory["metadata_sha256"], "split": split,
                    "images": len(images), "available_images": total_images,
                    "boxes": sum(item["boxes"] for item in selected),
                    "subset": len(images) < total_images,
                    "manifest_sha256": sha256(directory / "images.json")},
        "environment": {"python": platform.python_version(), "platform": platform.platform(),
                        "ultralytics": metadata.version("ultralytics"), "torch": torch.__version__},
        "arguments": arguments, "results": completed["results"],
        "limitations": [
            "Box detection metrics, not physical-card or exact-hand accuracy.",
            "Precision/recall use Ultralytics' max-F1 operating point, not a deployed confidence threshold.",
            "Original checkpoint training split is unconfirmed; this source may overlap pretraining.",
            "No joker labels; no claim of joker recognition or independent real-hand accuracy.",
            "Validator timing is not browser latency; image selection is sorted, not a random sample.",
        ],
    }
    (directory / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    return {"report": str(directory / "report.json"), "images": len(images),
            "results": {key: value for key, value in report["results"].items() if key != "per_class"}}
