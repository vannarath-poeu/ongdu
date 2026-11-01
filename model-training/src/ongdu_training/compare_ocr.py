"""Paired image-identity evaluation of the unchanged app OCR and pinned YOLOv8."""

from collections import Counter
from datetime import datetime, timezone
import json
import random
import shutil
import subprocess
import time

from .evaluate import sha256, verify_placeholder
from .pipeline import IMAGE_SUFFIXES, inspect_dataset, local_path
from .training import dataset_names, environment, runtime, write_json

SUITS = {"clubs": "C", "diamonds": "D", "hearts": "H", "spades": "S"}


def identity_score(expected, predictions, unknown=0):
    """Labels may repeat for opposite corners: presence sets are the common unit.

    Duplicate predictions remain visible but are not assumed to be extra physical
    cards. No ground-truth crop, corner pairing, or deduplication is given to OCR.
    """
    truth, predicted = set(expected), set(predictions)
    missing, extra = sorted(truth - predicted), sorted(predicted - truth)
    return {"correct": len(truth & predicted), "ground_truth_identities": len(truth),
            "predicted_identities": len(predicted), "exact_identity_set": truth == predicted,
            "missing": missing, "extra": extra, "unknown_outputs": unknown,
            "duplicate_identity_outputs": sum(count - 1 for count in Counter(predictions).values()),
            "total_outputs": len(predictions) + unknown}


def summarize(rows, engine):
    scores = [row[engine]["score"] for row in rows]
    correct = sum(s["correct"] for s in scores)
    predicted = sum(s["predicted_identities"] for s in scores)
    truth = sum(s["ground_truth_identities"] for s in scores)
    times = sorted(row[engine]["elapsed_ms"] for row in rows)
    return {"images": len(rows), "exact_identity_sets": sum(s["exact_identity_set"] for s in scores),
            "exact_identity_set_rate": sum(s["exact_identity_set"] for s in scores) / len(rows),
            "unique_identity_precision": correct / predicted if predicted else 0.0,
            "unique_identity_recall": correct / truth if truth else 0.0,
            "correct_identities": correct, "ground_truth_identities": truth, "predicted_identities": predicted,
            "missing_identities": sum(len(s["missing"]) for s in scores),
            "extra_identities": sum(len(s["extra"]) for s in scores),
            "unknown_outputs": sum(s["unknown_outputs"] for s in scores),
            "duplicate_identity_outputs": sum(s["duplicate_identity_outputs"] for s in scores),
            "errors": sum(row[engine]["status"] != "ok" for row in rows),
            "latency_ms": {"p50": times[(len(times) - 1) // 2], "p95": times[min(len(times) - 1, int(len(times) * 0.95))]},
            "timing_scope": "Node startup + per-photo OCR worker init + scan" if engine == "ocr" else
                            "warm Python YOLO prediction including image decode; excludes model initialization"}


def compare_ocr(root, config, *, output, limit=100, seed=42, confidence=0.25, iou=0.7,
                cache="artifacts/ocr-cache", timeout=120):
    """Validation only; CPU sequential inference leaves the training GPU alone."""
    if limit is not None and limit < 1:
        raise ValueError("Image limit must be positive or --all-images")
    if not 0 < confidence <= 1 or not 0 < iou <= 1 or timeout <= 0:
        raise ValueError("Invalid confidence, IoU or timeout")
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js with TypeScript support is required (same as app image tests)")
    weights = local_path(root, config["weights"]["yolov8n"])
    provenance = verify_placeholder(root, weights)
    inventory = inspect_dataset(root, config, "yolov8n", check_labels=True)
    source = local_path(root, config["datasets"]["yolov8n"])
    names = dataset_names(source)
    if names != [item["label"] for item in provenance["classes"]]:
        raise ValueError("Dataset and placeholder class order differ")
    cache = local_path(root, cache)
    language = cache / "eng.traineddata"
    if not language.is_file():
        raise ValueError("Supply cached English OCR data at " + str(language) + "; see README")
    images = sorted(p for p in (source / "valid/images").iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    total = len(images)
    if limit is not None and limit < total:
        images = sorted(random.Random(seed).sample(images, limit))
    directory = local_path(root, output)
    directory.mkdir(parents=True, exist_ok=False)
    manifest = []
    for image in images:
        label = source / "valid/labels" / (image.stem + ".txt")
        annotations = [line.split() for line in label.read_text().splitlines() if line.strip()]
        manifest.append({"image": str(image), "image_sha256": sha256(image), "label_sha256": sha256(label),
                         "label_boxes": len(annotations), "identities": sorted({names[int(a[0])] for a in annotations})})
    write_json(directory / "images.json", manifest)
    app_sources = [root.parent / path for path in ("lib/card-recognition.ts", "lib/card-corner-recognition.ts",
                   "lib/i18n/message.ts", "lib/types.ts", "package-lock.json")]
    sources = {str(p.relative_to(root.parent)): sha256(p) for p in app_sources}
    write_json(directory / "provenance.json", {"app_source_sha256": sources,
               "adapter_sha256": sha256(root / "scripts/ocr_predict.mjs"), "language_sha256": sha256(language),
               "evaluator_sha256": sha256(root / "src/ongdu_training/compare_ocr.py"),
               "checkpoint": provenance["source"], "environment": environment(),
               "node": subprocess.check_output([node, "--version"], text=True).strip()})
    torch, YOLO = runtime(root, config)
    torch.set_num_threads(2)
    detector = YOLO(str(weights), task="detect")
    if [detector.names[i] for i in range(len(detector.names))] != names:
        raise ValueError("Checkpoint runtime class order mismatch")
    # One unscored synthetic warmup; never tune on evaluation labels.
    import numpy as np
    detector.predict(np.zeros((640, 640, 3), dtype=np.uint8), device="cpu", verbose=False)
    rows = []
    with (directory / "predictions.jsonl").open("x") as stream:
        for index, item in enumerate(manifest):
            started = time.perf_counter()
            try:
                completed = subprocess.run([node, str(root / "scripts/ocr_predict.mjs"), item["image"], str(cache)],
                                           text=True, capture_output=True, timeout=timeout, check=True)
                ocr = json.loads(completed.stdout.splitlines()[-1])
            except subprocess.TimeoutExpired:
                ocr = {"status": "timeout", "cards": [], "error": "OCR exceeded per-image deadline"}
            except (subprocess.CalledProcessError, json.JSONDecodeError, IndexError) as error:
                ocr = {"status": "adapter-error", "cards": [], "error": str(error)}
                if isinstance(error, subprocess.CalledProcessError):
                    ocr["stderr"] = error.stderr[-4000:]
            ocr["scan_elapsed_ms"] = ocr.get("elapsed_ms")
            ocr["elapsed_ms"] = (time.perf_counter() - started) * 1000
            identities = [card["rank"] + SUITS[card["suit"]] for card in ocr["cards"]
                          if card.get("rank") and card.get("suit") in SUITS]
            ocr["score"] = identity_score(item["identities"], identities, len(ocr["cards"]) - len(identities))
            started = time.perf_counter()
            result = detector.predict(item["image"], device="cpu", imgsz=640, conf=confidence, iou=iou,
                                      max_det=300, augment=False, verbose=False)[0]
            boxes = result.boxes
            predictions = [{"label": names[int(c)], "confidence": float(s), "xyxy": b.tolist()}
                           for c, s, b in zip(boxes.cls.cpu().tolist(), boxes.conf.cpu().tolist(), boxes.xyxy.cpu())]
            placeholder = {"status": "ok", "elapsed_ms": (time.perf_counter() - started) * 1000,
                           "detections": predictions,
                           "score": identity_score(item["identities"], [p["label"] for p in predictions])}
            row = {"image": item["image"], "truth": item["identities"], "ocr": ocr, "placeholder": placeholder}
            rows.append(row)
            stream.write(json.dumps(row, allow_nan=False) + "\n")
            stream.flush()
            if ocr["status"] == "adapter-error":
                raise RuntimeError("OCR adapter failed; inspect predictions.jsonl stderr before benchmarking")
            print("Paired OCR/YOLO evaluation: {}/{}".format(index + 1, len(manifest)), flush=True)
    if any(sha256(p) != sources[str(p.relative_to(root.parent))] for p in app_sources):
        raise RuntimeError("App recognition source changed during benchmark; results are incomplete")
    if sha256(language) != json.loads((directory / "provenance.json").read_text())["language_sha256"]:
        raise RuntimeError("OCR language data changed during benchmark")
    for item in manifest:
        image = local_path(root, item["image"])
        label = source / "valid/labels" / (image.stem + ".txt")
        if sha256(image) != item["image_sha256"] or sha256(label) != item["label_sha256"]:
            raise RuntimeError("Input image or label changed during benchmark")
    report = {"schema_version": 1, "created_at": datetime.now(timezone.utc).isoformat(), "split": "val",
              "images": len(rows), "available_images": total, "subset": len(rows) < total, "selection_seed": seed,
              "manifest_sha256": sha256(directory / "images.json"), "dataset": inventory,
              "settings": {"confidence": confidence, "iou": iou, "ocr_timeout_seconds": timeout, "device": "cpu"},
              "metric_unit": "unique annotated identity presence per image, not physical-card count or box AP",
              "ocr": summarize(rows, "ocr"), "placeholder": summarize(rows, "placeholder"),
              "paired": {"both_exact": sum(r["ocr"]["score"]["exact_identity_set"] and r["placeholder"]["score"]["exact_identity_set"] for r in rows),
                         "ocr_only_exact": sum(r["ocr"]["score"]["exact_identity_set"] and not r["placeholder"]["score"]["exact_identity_set"] for r in rows),
                         "placeholder_only_exact": sum(not r["ocr"]["score"]["exact_identity_set"] and r["placeholder"]["score"]["exact_identity_set"] for r in rows)},
              "limitations": ["Source annotations may include multiple corners per card; sets collapse repeated identities for BOTH engines.",
                              "Set accuracy ignores duplicate/unknown outputs; those are reported separately and can harm review UX.",
                              "No physical instance IDs, joker labels, or independent 9/10-card hands; not exact-hand accuracy.",
                              "Public source may overlap placeholder training; this is an in-domain diagnostic.",
                              "OCR uses production code with a Node canvas adapter; browser rasterization/fonts and timing may differ.",
                              "OCR includes per-image worker startup; warm YOLO excludes model startup. Timing is not a browser speed comparison."]}
    write_json(directory / "report.json", report)
    summary = ["# OCR versus pinned YOLOv8 placeholder", "",
               "Validation images: {} of {}. Seed: {}. YOLO confidence: {}. IoU: {}.".format(len(rows), total, seed, confidence, iou),
               "", "Metric | App OCR | Placeholder YOLOv8", "--- | ---: | ---:"]
    for title, key, percent in (("Exact unique-identity set", "exact_identity_set_rate", True),
                                ("Unique-identity precision", "unique_identity_precision", True),
                                ("Unique-identity recall", "unique_identity_recall", True),
                                ("Missing identities", "missing_identities", False),
                                ("Extra identities", "extra_identities", False),
                                ("Unknown outputs", "unknown_outputs", False),
                                ("Repeated-identity outputs", "duplicate_identity_outputs", False),
                                ("Scan errors/timeouts", "errors", False)):
        values = ["{:.1%}".format(report[e][key]) if percent else str(report[e][key]) for e in ("ocr", "placeholder")]
        summary.append("{} | {} | {}".format(title, *values))
    summary.extend(["", "These are identity-presence scores, not physical-card or exact-hand accuracy. "
                    "Repeated source corner labels are collapsed symmetrically; duplicate and unknown predictions remain "
                    "reported separately. The placeholder may have trained on this source. Node timing does not establish browser speed.",
                    "", "See report.json for settings/limitations, predictions.jsonl for paired outputs, and provenance.json for source hashes."])
    (directory / "summary.md").write_text("\n".join(summary) + "\n")
    return {"report": str(directory / "report.json"), "ocr": report["ocr"], "placeholder": report["placeholder"]}
