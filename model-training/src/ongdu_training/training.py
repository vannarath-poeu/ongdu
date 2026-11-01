"""Audited local datasets and resumable, offline Ultralytics training."""

from datetime import datetime, timezone
from importlib import metadata
import ast
import json
import os
from pathlib import Path
import platform
import time

from .evaluate import sha256, verify_placeholder
from .pipeline import IMAGE_SUFFIXES, inspect_dataset, local_path

ULTRALYTICS_VERSION = "8.4.197"


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def runtime(root, config):
    os.environ["YOLO_CONFIG_DIR"] = str(local_path(root, config["output"]) / ".ultralytics")
    os.environ["YOLO_OFFLINE"] = "true"
    os.environ["YOLO_AUTOINSTALL"] = "false"
    try:
        import torch
        from ultralytics import YOLO, settings
    except ImportError as error:
        raise ValueError("Install ML dependencies: uv sync --locked --extra train") from error
    if metadata.version("ultralytics") != ULTRALYTICS_VERSION:
        raise ValueError("Expected ultralytics==" + ULTRALYTICS_VERSION)
    settings.update({"sync": False})
    return torch, YOLO


def environment():
    return {"python": platform.python_version(), "platform": platform.platform(),
            "packages": {item.metadata["Name"]: item.version for item in metadata.distributions()}}


def device_for(torch, requested):
    if requested == "auto":
        requested = "mps" if torch.backends.mps.is_available() else "0" if torch.cuda.is_available() else "cpu"
    if requested == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS is unavailable; use --device cpu")
    if requested == "0" and not torch.cuda.is_available():
        raise ValueError("CUDA is unavailable; use --device cpu")
    return requested


def dataset_names(dataset):
    # These pinned exports use a literal list; parsing only that field avoids a YAML dependency.
    for line in (dataset / "data.yaml").read_text().splitlines():
        if line.startswith("names:"):
            names = ast.literal_eval(line.partition(":")[2].strip())
            if not isinstance(names, list) or len(names) != 52 or len(set(names)) != 52:
                break
            suits = "CDHS"
            expected = {r + s for r in [str(i) for i in range(2, 11)] + ["J", "Q", "K", "A"] for s in suits}
            if set(names) == expected:
                return names
    raise ValueError("Dataset must declare exactly 52 unique ordinary card labels")


def prepare(root, config, model="yolo26n", *, output=None, limit=None):
    """Freeze split hashes, decode all images, and exclude train/val leakage.

    Test membership takes precedence over validation, then training. Related
    Roboflow augmentation stems and exact image hashes never cross splits.
    Raw exports are immutable; symlinks keep Ultralytics caches in artifacts.
    """
    from PIL import Image
    if limit is not None and limit < 1:
        raise ValueError("Image limit must be positive")
    inventory = inspect_dataset(root, config, model, check_labels=True)
    source = Path(inventory["path"])
    names = dataset_names(source)
    directory = local_path(root, output or config["output"] + "/prepared/" + model)
    directory.mkdir(parents=True, exist_ok=False)
    splits, excluded, owners_hash, owners_group = {}, [], {}, {}
    # Audit ALL images even when selecting a small smoke subset.
    for split in ("test", "valid", "train"):
        entries = []
        for image in sorted((source / split / "images").iterdir()):
            if image.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            label = source / split / "labels" / (image.stem + ".txt")
            with Image.open(image) as decoded:
                decoded.verify()
            digest = sha256(image)
            group = image.stem.split(".rf.")[0]
            owner = owners_hash.get(digest) or owners_group.get(group)
            if owner and owner != split:
                excluded.append({"split": split, "image": image.name, "reserved_for": owner})
                continue
            owners_hash[digest] = split
            owners_group[group] = split
            entries.append({"image": image.name, "image_sha256": digest,
                            "label_sha256": sha256(label), "augmentation_group": group,
                            "boxes": sum(bool(x.strip()) for x in label.read_text().splitlines())})
        if limit:
            entries = entries[:limit]
        if not entries:
            raise ValueError("No images remain in " + split)
        splits[split] = entries
        for item in entries:
            for folder, filename in (("images", item["image"]), ("labels", Path(item["image"]).stem + ".txt")):
                target = directory / split / folder / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(source / split / folder / filename)
    manifest = {"schema_version": 1, "source": str(source), "names": names,
                "inventory": inventory, "source_url": config["dataset_source"],
                "license": config["dataset_license"], "subset": limit is not None,
                "split_policy": "test > valid > train; exclude cross-split exact hashes and .rf. sibling stems",
                "splits": splits, "excluded_cross_split": excluded,
                "upstream_advertised_images": 24240,
                "local_images": sum(x["images"] for x in inventory["splits"].values()),
                "limitations": ["Offline 640px stretch, mirroring and augmentation already applied upstream.",
                                "Filename/hash audit does not detect all perceptual or capture-session siblings.",
                                "Box annotations do not establish physical-card counts or exact-hand accuracy."]}
    write_json(directory / "manifest.json", manifest)
    write_json(directory / "dataset.yaml", {"path": str(directory), "nc": len(names), "names": names,
               **{key: str(directory / folder / "images") for key, folder in
                  (("train", "train"), ("val", "valid"), ("test", "test"))}})
    for notice in source.glob("README*"):
        (directory / notice.name).write_bytes(notice.read_bytes())
    return {"prepared": str(directory), "manifest_sha256": sha256(directory / "manifest.json"),
            "splits": {key: len(value) for key, value in splits.items()}, "excluded": len(excluded)}


def verify_prepared(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    data = json.loads((directory / "dataset.yaml").read_text())
    expected_data = {"path": str(directory), "nc": len(manifest["names"]), "names": manifest["names"],
                     **{k: str(directory / v / "images") for k, v in
                        (("train", "train"), ("val", "valid"), ("test", "test"))}}
    if data != expected_data:
        raise ValueError("Prepared dataset.yaml differs from frozen manifest")
    for split, entries in manifest["splits"].items():
        actual_images = {p.name for p in (directory / split / "images").iterdir() if p.suffix.lower() in IMAGE_SUFFIXES}
        actual_labels = {p.name for p in (directory / split / "labels").glob("*.txt")}
        if actual_images != {item["image"] for item in entries} or actual_labels != {
                Path(item["image"]).stem + ".txt" for item in entries}:
            raise ValueError("Prepared split membership changed: " + split)
        for item in entries:
            image = directory / split / "images" / item["image"]
            label = directory / split / "labels" / (image.stem + ".txt")
            if sha256(image) != item["image_sha256"] or sha256(label) != item["label_sha256"]:
                raise ValueError("Prepared data changed: " + str(image))
    return manifest


def train(root, config, model="yolo26n", *, prepared=None, output=None,
          epochs=None, batch=None, device=None, resume=False):
    weights = local_path(root, config["weights"][model])
    if not weights.is_file():
        raise ValueError("Supply local pretrained checkpoint: " + str(weights))
    if model == "yolov8n":
        verify_placeholder(root, weights)
    else:
        provenance = json.loads((root / "configs/yolo26n-source.json").read_text())
        if sha256(weights) != provenance["sha256"]:
            raise ValueError("YOLO26n source checkpoint hash differs from pinned provenance")
    directory = local_path(root, output or config["output"] + "/training/" + model)
    prepared = local_path(root, prepared or config["output"] + "/prepared/" + model)
    manifest = verify_prepared(prepared)
    torch, YOLO = runtime(root, config)
    options = dict(config["training"])
    options.update({k: v for k, v in (("epochs", epochs), ("batch", batch), ("device", device)) if v is not None})
    if options["epochs"] < 1 or options["batch"] < 1:
        raise ValueError("Epochs and batch must be positive")
    options["device"] = device_for(torch, options["device"])
    options.update(data=str(prepared / "dataset.yaml"), project=str(directory), name="fit",
                   exist_ok=False, cache=False, amp=False, pretrained=True, optimizer="auto",
                   degrees=5.0, translate=0.05, scale=0.2, perspective=0.0001,
                   fliplr=0.0, flipud=0.0, mixup=0.0, mosaic=0.5,
                   close_mosaic=min(10, options["epochs"]), hsv_h=0.015, hsv_s=0.4, hsv_v=0.3,
                   nms=None, save=True, plots=True)
    identity = {"model": model, "source_sha256": sha256(weights),
                "data_sha256": sha256(prepared / "manifest.json"), "options": options,
                "environment": environment()}
    if resume:
        previous = json.loads((directory / "training.json").read_text())
        if previous["identity"] != identity:
            raise ValueError("Resume rejected: dataset, source, options or environment changed")
        checkpoint = directory / "fit/weights/last.pt"
        if not checkpoint.is_file():
            raise ValueError("No resumable last.pt in " + str(directory))
        detector = YOLO(str(checkpoint), task="detect")
    else:
        directory.mkdir(parents=True, exist_ok=False)
        detector = YOLO(str(weights), task="detect")
    report = {"schema_version": 1, "status": "running", "identity": identity,
              "started_at": datetime.now(timezone.utc).isoformat(),
              "subset": manifest["subset"], "joker_training_ready": False}
    write_json(directory / "training.json", report)
    start = time.monotonic()
    try:
        detector.train(**({"resume": True} if resume else options))
        best = directory / "fit/weights/best.pt"
        if not best.is_file():
            raise RuntimeError("Trainer did not produce best.pt")
        report.update(status="complete", elapsed_seconds=time.monotonic() - start,
                      best_sha256=sha256(best), best=str(best),
                      actual_epochs=int(detector.trainer.epoch) + 1,
                      metrics={k: float(v) for k, v in detector.trainer.metrics.items()})
    except BaseException as error:
        report.update(status="interrupted", elapsed_seconds=time.monotonic() - start, error=str(error))
        write_json(directory / "training.json", report)
        raise
    write_json(directory / "training.json", report)
    return {"training": str(directory), "best": str(best), "metrics": report["metrics"]}
