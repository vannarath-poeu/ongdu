"""Export both YOLO26 heads and verify real ONNX Runtime/PyTorch parity."""

import ast
import json
from pathlib import Path
import shutil
import time

from .evaluate import sha256
from .onnx_runtime import preprocess, validate_signature, decode
from .pipeline import local_path
from .training import environment, runtime, verify_prepared, write_json


def compare_outputs(actual, expected, mode, confidence=0.25):
    """NMS-free top-k ordering is unstable for ties; match class/box sets.

    Below-threshold coordinates are not actionable and tied top-k candidates can
    differ at the cutoff. Compare all scores, then all deployed detections.
    """
    import numpy as np
    if not np.isfinite(actual).all() or not np.isfinite(expected).all():
        raise ValueError("Non-finite parity output")
    if mode == "raw":
        np.testing.assert_allclose(actual, expected, atol=1e-3, rtol=1e-3)
        return float(np.max(np.abs(actual - expected)))
    np.testing.assert_allclose(np.sort(actual[0, :, 4]), np.sort(expected[0, :, 4]), atol=1e-4, rtol=1e-3)
    a = actual[0][actual[0, :, 4] >= confidence]
    b = expected[0][expected[0, :, 4] >= confidence].copy()
    if len(a) != len(b):
        raise ValueError("NMS-free confidence threshold count differs")
    max_error = 0.0
    for row in a:
        costs = np.max(np.abs(b[:, :4] - row[:4]), axis=1)
        costs[b[:, 5] != row[5]] = np.inf
        index = int(costs.argmin())
        if not np.isfinite(costs[index]):
            raise ValueError("NMS-free class parity failed")
        np.testing.assert_allclose(row[:4], b[index, :4], atol=1e-3, rtol=1e-3)
        np.testing.assert_allclose(row[4], b[index, 4], atol=1e-4, rtol=1e-3)
        max_error = max(max_error, float(costs[index]))
        b = np.delete(b, index, axis=0)
    return max_error


def export_onnx(root, config, *, weights, prepared, output, modes=("raw", "nms-free"), parity_images=3):
    import numpy as np
    import onnx
    import onnxruntime as ort
    from PIL import Image, ImageOps
    if parity_images < 1:
        raise ValueError("At least one parity image is required")
    if not modes or any(mode not in ("raw", "nms-free") for mode in modes):
        raise ValueError("Unsupported export mode")
    weights, prepared, directory = (local_path(root, p) for p in (weights, prepared, output))
    if not weights.is_file():
        raise ValueError("Local checkpoint missing: " + str(weights))
    dataset = verify_prepared(prepared)
    torch, YOLO = runtime(root, config)
    source = YOLO(str(weights), task="detect")
    if "yolo26" not in str(source.model.yaml.get("yaml_file", "")):
        raise ValueError("This exporter requires a YOLO26 detection checkpoint")
    names = [source.names[i] for i in range(len(source.names))]
    if names != dataset["names"]:
        raise ValueError("Checkpoint and prepared class order differ")
    directory.mkdir(parents=True, exist_ok=False)
    packages = []
    for mode in modes:
        target = directory / mode
        target.mkdir()
        # Separate checkpoint copies prevent export collisions or head fusion reuse.
        checkpoint = target / "source.pt"
        shutil.copy2(weights, checkpoint)
        model = YOLO(str(checkpoint), task="detect")
        arguments = dict(format="onnx", imgsz=640, batch=1, device="cpu", half=False,
                         dynamic=False, simplify=False, opset=17, nms=None if mode == "raw" else False)
        exported = Path(model.export(**arguments))
        destination = target / "detector.onnx"
        exported.replace(destination)
        checkpoint.unlink()
        graph = onnx.load(str(destination))
        onnx.checker.check_model(graph, full_check=True)
        if any(node.op_type == "NonMaxSuppression" for node in graph.graph.node):
            raise ValueError("Unexpected embedded NMS")
        if [(entry.domain, entry.version) for entry in graph.opset_import if entry.domain in ("", "ai.onnx")] != [("", 17)]:
            raise ValueError("Expected ONNX opset 17")
        graph_names = {item.key: item.value for item in graph.metadata_props}
        if ast.literal_eval(graph_names.get("names", "{}")) != dict(enumerate(names)):
            raise ValueError("ONNX class metadata differs from training mapping")
        session = ort.InferenceSession(str(destination), providers=["CPUExecutionProvider"])
        inputs, outputs = session.get_inputs(), session.get_outputs()
        if len(inputs) != 1 or len(outputs) != 1 or any(x.type != "tensor(float)" for x in (inputs[0], outputs[0])):
            raise ValueError("Expected one FP32 input and output")
        validate_signature(inputs[0].shape, outputs[0].shape, mode, len(names))
        reference = YOLO(str(weights), task="detect").model.cpu().float().eval()
        reference.end2end = mode == "nms-free"
        reference.fuse(verbose=False)
        # Export-mode head returns only decoded tensors, with no auxiliary heads.
        reference.model[-1].export = True
        reference.model[-1].format = "onnx"
        comparisons = []
        for item in dataset["splits"]["valid"][:parity_images]:
            path = prepared / "valid/images" / item["image"]
            with Image.open(path) as image:
                tensor, geometry = preprocess(np.asarray(ImageOps.exif_transpose(image).convert("RGB")))
            with torch.inference_mode():
                expected = reference(torch.from_numpy(tensor))
            if isinstance(expected, tuple):
                expected = expected[0]
            expected = expected.detach().cpu().numpy()
            started = time.perf_counter()
            actual = session.run([outputs[0].name], {inputs[0].name: tensor})[0]
            elapsed = (time.perf_counter() - started) * 1000
            # Absolute pixel tolerance plus relative tolerance; compare matching heads only.
            max_error = compare_outputs(actual, expected, mode)
            pt_boxes = decode(expected, mode, names, geometry)
            ort_boxes = decode(actual, mode, names, geometry)
            if len(pt_boxes) != len(ort_boxes):
                raise ValueError("Decoded detection count parity failed")
            # Sort by identity and coordinates so score ties do not reorder boxes.
            key = lambda box: (box["class_id"], *[round(x, 1) for x in box["xyxy"]])
            for a, b in zip(sorted(pt_boxes, key=key), sorted(ort_boxes, key=key)):
                if a["class_id"] != b["class_id"]:
                    raise ValueError("Decoded class parity failed")
                np.testing.assert_allclose(a["xyxy"], b["xyxy"], atol=0.05, rtol=1e-3)
                np.testing.assert_allclose(a["confidence"], b["confidence"], atol=1e-4, rtol=1e-3)
            comparisons.append({"image": item["image"], "image_sha256": item["image_sha256"],
                                "max_abs_error": max_error,
                                "ort_inference_ms": elapsed, "detections": len(ort_boxes)})
        contract = {"schema_version": 1, "status": "verified-experimental", "architecture": "yolo26n",
                    "mode": mode, "decoder": "yolo26-" + mode + "-v1", "preprocess": "letterbox-rgb-v1",
                    "input_name": inputs[0].name, "input_shape": inputs[0].shape,
                    "output_name": outputs[0].name, "output_shape": outputs[0].shape,
                    "dtype": "float32", "opset": 17, "padding": 114, "scale": 1 / 255,
                    "rounding": "round-half-up", "names": names, "onnx_sha256": sha256(destination),
                    "bytes": destination.stat().st_size, "checkpoint_sha256": sha256(weights),
                    "dataset_sha256": sha256(prepared / "manifest.json"), "subset": dataset["subset"],
                    "export_arguments": arguments, "parity": {"atol": 1e-3, "rtol": 1e-3, "confidence": 0.25,
                        "method": "full raw tensor" if mode == "raw" else "all sorted scores; class/box matching above confidence; low-score top-k ties ignored",
                        "images": comparisons},
                    "environment": environment(), "browser_verified": False, "joker_supported": False,
                    "limitations": ["Experimental; no improvement or browser compatibility gate passed.",
                                    "Source box detections are not physical-card counts."]}
        for notice in prepared.glob("README*"):
            shutil.copy2(notice, target / notice.name)
        write_json(target / "manifest.json", contract)
        packages.append(str(target / "manifest.json"))
    write_json(directory / "exports.json", {"packages": packages})
    return {"packages": packages}
