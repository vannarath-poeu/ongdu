"""YOLO26 training, validation and export orchestration."""

import json
from pathlib import Path

from .evaluate import metric_report, sha256
from .export import export_onnx
from .pipeline import local_path
from .training import device_for, prepare, runtime, train, verify_prepared, write_json


def evaluate_candidate(root, config, *, weights, prepared, output, split="val", device="auto", batch=4):
    weights, prepared, directory = (local_path(root, p) for p in (weights, prepared, output))
    if split not in ("val", "test") or batch < 1:
        raise ValueError("Expected val/test split and positive batch")
    if not weights.is_file():
        raise ValueError("Local checkpoint missing: " + str(weights))
    manifest = verify_prepared(prepared)
    torch, YOLO = runtime(root, config)
    model = YOLO(str(weights), task="detect")
    if [model.names[i] for i in range(len(model.names))] != manifest["names"]:
        raise ValueError("Candidate class order differs from prepared dataset")
    directory.mkdir(parents=True, exist_ok=False)
    completed = {}

    def capture(validator):
        completed.update(images_seen=int(validator.seen), results=metric_report(validator.metrics, manifest["names"]))
        write_json(directory / "metrics.json", completed)

    model.add_callback("on_val_end", capture)
    model.val(data=str(prepared / "dataset.yaml"), split=split, device=device_for(torch, device),
              imgsz=640, batch=batch, workers=0, half=False, conf=0.001, iou=0.7, max_det=300,
              nms=None, rect=False, plots=True, save_json=False, project=str(directory), name="validation")
    expected = len(manifest["splits"]["valid" if split == "val" else "test"])
    if completed.get("images_seen") != expected:
        raise RuntimeError("Validation skipped selected images")
    report = {"schema_version": 1, "checkpoint_sha256": sha256(weights),
              "dataset_sha256": sha256(prepared / "manifest.json"), "split": split,
              "subset": manifest["subset"], "head": "one-to-many with external NMS", **completed,
              "limitations": ["Source-box metrics only; physical-card counting and browser behavior unverified.",
                              "No joker data. Test split is reserved until settings are frozen."]}
    write_json(directory / "report.json", report)
    return {"report": str(directory / "report.json"), "results": completed["results"]}


def run(root, config, *, output, smoke=False, device="auto", batch=None, epochs=None):
    batch = config["training"]["batch"] if batch is None else batch
    directory = local_path(root, output)
    directory.mkdir(parents=True, exist_ok=False)
    try:
        prepared = prepare(root, config, output=directory / "prepared", limit=32 if smoke else None)
        trained = train(root, config, prepared=prepared["prepared"], output=directory / "training",
                        epochs=epochs or (2 if smoke else config["training"]["epochs"]), batch=batch, device=device)
        evaluation = evaluate_candidate(root, config, weights=trained["best"], prepared=prepared["prepared"],
                                        output=directory / "evaluation", device=device, batch=batch)
        exported = export_onnx(root, config, weights=trained["best"], prepared=prepared["prepared"],
                               output=directory / "onnx")
        result = {"status": "complete-experimental", "smoke": smoke, "prepared": prepared,
                  "training": trained, "evaluation": evaluation, "export": exported}
        write_json(directory / "run.json", result)
        return result
    except BaseException as error:
        write_json(directory / "failure.json", {"error": str(error),
                   "recovery": "Use train --resume with the same prepared/output/options, then evaluate/export separately."})
        raise
