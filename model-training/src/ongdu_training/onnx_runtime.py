"""Strict FP32 ONNX Runtime contract, RGB letterbox, and architecture-specific decoding."""

import json
import math
from pathlib import Path
import time

from .evaluate import sha256


def preprocess(image):
    import cv2
    import numpy as np
    height, width = image.shape[:2]
    if width < 1 or height < 1 or width * height > 16_000_000:
        raise ValueError("Image dimensions exceed decode contract")
    scale = min(640 / width, 640 / height)
    rw, rh = max(1, math.floor(width * scale + 0.5)), max(1, math.floor(height * scale + 0.5))
    left, top = (640 - rw) // 2, (640 - rh) // 2
    canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
    canvas[top:top + rh, left:left + rw] = cv2.resize(image, (rw, rh), interpolation=cv2.INTER_LINEAR)
    tensor = np.ascontiguousarray(canvas.transpose(2, 0, 1)[None], dtype=np.float32) / 255
    return tensor, {"width": width, "height": height, "rw": rw, "rh": rh, "left": left, "top": top}


def validate_signature(input_shape, output_shape, mode, classes=52):
    if mode not in ("raw", "nms-free"):
        raise ValueError("Unknown ONNX decoder mode")
    expected = [1, classes + 4, 8400] if mode == "raw" else [1, 300, 6]
    if list(input_shape) != [1, 3, 640, 640] or list(output_shape) != expected:
        raise ValueError("Unexpected ONNX signature: {} -> {} (expected {})".format(input_shape, output_shape, expected))


def decode(output, mode, names, geometry, *, confidence=0.25, iou=0.5):
    import numpy as np
    if not 0 < confidence <= 1 or not 0 < iou <= 1:
        raise ValueError("Confidence and IoU must be in (0, 1]")
    validate_signature([1, 3, 640, 640], output.shape, mode, len(names))
    if not np.isfinite(output).all():
        raise ValueError("Non-finite model outputs")
    if mode == "raw":
        raw = output[0].T
        classes = raw[:, 4:].argmax(axis=1)
        scores = raw[np.arange(len(raw)), classes + 4]
        keep = scores >= confidence
        boxes = raw[keep, :4].copy()
        boxes[:, :2] -= boxes[:, 2:] / 2
        boxes[:, 2:] += boxes[:, :2]
        rows = np.column_stack((boxes, scores[keep], classes[keep]))
    else:
        rows = output[0][output[0, :, 4] >= confidence].copy()
    if len(rows) and (np.any(rows[:, 4] > 1) or np.any(rows[:, 5] != np.floor(rows[:, 5]))
                      or np.any(rows[:, 5] < 0) or np.any(rows[:, 5] >= len(names))):
        raise ValueError("Invalid model confidence or class ID")
    rows = rows[np.argsort(-rows[:, 4], kind="stable")]
    kept = []
    for row in rows:
        if row[2] <= row[0] or row[3] <= row[1]:
            continue
        if mode == "raw":
            suppressed = False
            for previous in kept:
                if row[5] != previous[5]:
                    continue
                wh = np.maximum(0, np.minimum(row[2:4], previous[2:4]) - np.maximum(row[:2], previous[:2]))
                intersection = float(wh.prod())
                union = float((row[2:4] - row[:2]).prod() + (previous[2:4] - previous[:2]).prod()) - intersection
                if union > 0 and intersection / union > iou:
                    suppressed = True
                    break
            if suppressed:
                continue
        # The one-to-one head must never receive a second IoU suppression pass.
        kept.append(row)
        if len(kept) == 300:
            break
    detections = []
    for row in kept:
        box = row[:4].astype(float).copy()
        box[[0, 2]] = (box[[0, 2]] - geometry["left"]) * geometry["width"] / geometry["rw"]
        box[[1, 3]] = (box[[1, 3]] - geometry["top"]) * geometry["height"] / geometry["rh"]
        box[[0, 2]] = np.clip(box[[0, 2]], 0, geometry["width"])
        box[[1, 3]] = np.clip(box[[1, 3]], 0, geometry["height"])
        if box[2] > box[0] and box[3] > box[1]:
            detections.append({"class_id": int(row[5]), "label": names[int(row[5])],
                               "confidence": float(row[4]), "xyxy": box.tolist()})
    return detections


class Detector:
    def __init__(self, manifest):
        import onnxruntime as ort
        manifest = Path(manifest).resolve()
        self.contract = json.loads(manifest.read_text())
        c = self.contract
        if c.get("schema_version") != 1 or c.get("status") != "verified-experimental":
            raise ValueError("Expected a verified experimental runtime package")
        if c.get("preprocess") != "letterbox-rgb-v1" or c.get("decoder") != "yolo26-" + c["mode"] + "-v1":
            raise ValueError("Unsupported preprocessing/decoder contract")
        model = manifest.parent / "detector.onnx"
        if sha256(model) != c["onnx_sha256"]:
            raise ValueError("ONNX bytes differ from manifest hash")
        self.session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        inputs, outputs = self.session.get_inputs(), self.session.get_outputs()
        if len(inputs) != 1 or len(outputs) != 1 or inputs[0].type != "tensor(float)" or outputs[0].type != "tensor(float)":
            raise ValueError("Expected one FP32 input and output")
        if inputs[0].name != c["input_name"] or outputs[0].name != c["output_name"]:
            raise ValueError("ONNX names differ from runtime contract")
        validate_signature(inputs[0].shape, outputs[0].shape, c["mode"], len(c["names"]))

    def predict(self, image, *, confidence=0.25, iou=0.5):
        from PIL import Image, ImageOps
        import numpy as np
        start = time.perf_counter()
        with Image.open(image) as source:
            rgb = np.asarray(ImageOps.exif_transpose(source).convert("RGB"))
        tensor, geometry = preprocess(rgb)
        output = self.session.run([self.contract["output_name"]], {self.contract["input_name"]: tensor})[0]
        detections = decode(output, self.contract["mode"], self.contract["names"], geometry,
                            confidence=confidence, iou=iou)
        return {"image": str(image), "mode": self.contract["mode"], "detections": detections,
                "elapsed_ms": (time.perf_counter() - start) * 1000,
                "providers": self.session.get_providers(),
                "annotation_unit": "source box; not a deduplicated physical card"}
