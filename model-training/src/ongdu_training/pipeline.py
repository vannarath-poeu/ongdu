"""Local dataset inventory and explicit stage boundaries for future implementation."""

import hashlib
import json
import math
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = PROJECT_ROOT / "configs" / "pipeline.json"
MODELS = ("yolo26n", "yolov8n")
STAGES = ("prepare", "train", "export", "evaluate", "compare", "package")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def load_config(path=DEFAULT_CONFIG):
    """All configured paths are relative to the config's project, never the cwd."""
    path = Path(path).resolve()
    config = json.loads(path.read_text())
    if config.get("schema_version") != 1:
        raise ValueError("Unsupported pipeline config schema")
    if config.get("class_count") not in (52, 53):
        raise ValueError("Expected 52 ordinary cards or 53 classes including joker")
    for section in ("datasets", "weights"):
        for model in MODELS:
            value = config.get(section, {}).get(model)
            if not isinstance(value, str) or not value:
                raise ValueError("Missing {} path for {}".format(section, model))
    return path.parent.parent, config


def selected_models(model):
    if model == "all":
        return MODELS
    if model not in MODELS:
        raise ValueError("Unknown model: {}".format(model))
    return (model,)


def local_path(root, value):
    return (root / value).resolve()


def inspect_dataset(root, config, model, check_labels=False):
    """Inspect the supplied v4 exports without importing ML libraries or networking.

    Their data.yaml files contain ../train paths that must not be passed through
    blindly. The prepare stage will generate absolute split paths instead.
    """
    dataset = local_path(root, config["datasets"][model])
    yaml_path = dataset / "data.yaml"
    if not yaml_path.is_file():
        raise ValueError("Local dataset missing: {}".format(yaml_path))
    digest = hashlib.sha256(yaml_path.read_bytes()).hexdigest()
    if digest != config["dataset_yaml_sha256"]:
        raise ValueError("Dataset metadata changed; audit class order and update config: {}".format(yaml_path))
    if config["class_count"] != 52:
        raise ValueError("The pinned local v4 exports have 52 classes, not joker labels")
    splits = {}
    for split in ("train", "valid", "test"):
        images_dir, labels_dir = dataset / split / "images", dataset / split / "labels"
        if not images_dir.is_dir() or not labels_dir.is_dir():
            raise ValueError("Missing image/label directories for {}".format(images_dir))
        images = {p.stem for p in images_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES}
        labels = {p.stem for p in labels_dir.glob("*.txt")}
        if not images or images != labels:
            raise ValueError("Missing or unmatched images/labels in {}".format(images_dir))
        boxes = None
        if check_labels:
            boxes = 0
            for path in sorted(labels_dir.glob("*.txt")):
                for number, line in enumerate(path.read_text().splitlines(), 1):
                    if not line.strip():
                        continue
                    try:
                        fields = line.split()
                        if len(fields) != 5:
                            raise ValueError("expected class and four coordinates")
                        class_id = int(fields[0])
                        x, y, width, height = map(float, fields[1:])
                        if not 0 <= class_id < config["class_count"]:
                            raise ValueError("class ID outside configured mapping")
                        if not all(math.isfinite(v) and 0 <= v <= 1 for v in (x, y, width, height)):
                            raise ValueError("invalid normalized coordinates")
                        if width <= 0 or height <= 0:
                            raise ValueError("box has no area")
                    except ValueError as error:
                        raise ValueError("{}:{}: {}".format(path, number, error)) from error
                    boxes += 1
        splits[split] = {"images": len(images), "labels": len(labels), "boxes": boxes}
    return {"model": model, "path": str(dataset), "metadata_sha256": digest,
            "classes": 52, "joker_training_ready": False, "splits": splits}


def execution_plan(root, config, model="all"):
    candidates = []
    for name in selected_models(model):
        weights = local_path(root, config["weights"][name])
        candidates.append({
            "model": name,
            "dataset": str(local_path(root, config["datasets"][name])),
            "weights": str(weights),
            "weights_present": weights.is_file(),
            "export_modes": ["raw", "nms-free"] if name == "yolo26n" else ["raw"],
        })
    return {"status": "scaffold-only", "implemented": ["inspect", "run --dry-run"],
            "pending_stages": list(STAGES), "network_required": False,
            "class_count": config["class_count"],
            "joker_training_ready": config["joker_training_ready"],
            "training": config["training"], "candidates": candidates,
            "output": str(local_path(root, config["output"]))}


def run_stage(stage):
    """Fail closed until real stage implementations and acceptance checks exist."""
    raise NotImplementedError(
        "{} is not implemented in this scaffold. Use inspect or run --dry-run; "
        "see card-detector-training-pipeline.md for the implementation plan.".format(stage)
    )
