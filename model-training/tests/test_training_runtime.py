import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

from ongdu_training.onnx_runtime import Detector, decode, preprocess, validate_signature
from ongdu_training.export import compare_outputs
from ongdu_training.training import prepare, verify_prepared


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.names = [r + s for r in [str(i) for i in range(2, 11)] + ["J", "Q", "K", "A"] for s in "CDHS"]
        self.geometry = dict(width=640, height=640, rw=640, rh=640, left=0, top=0)

    def test_letterbox_rounding_rgb_padding_and_inverse(self):
        image = np.zeros((333, 1000, 3), dtype=np.uint8)
        image[:, :, 0] = 255
        tensor, geometry = preprocess(image)
        self.assertEqual(tensor.shape, (1, 3, 640, 640))
        self.assertEqual(tensor.dtype, np.float32)
        self.assertEqual(geometry["rh"], 213)
        self.assertEqual(geometry["top"], 213)
        self.assertAlmostEqual(float(tensor[0, 0, 0, 0]), 114 / 255)
        self.assertEqual(float(tensor[0, 0, 300, 300]), 1)
        output = np.zeros((1, 300, 6), dtype=np.float32)
        output[0, 0] = [0, 213, 640, 426, 0.9, 0]
        result = decode(output, "nms-free", self.names, geometry)
        self.assertEqual(result[0]["xyxy"], [0, 0, 1000, 333])

    def test_raw_class_aware_nms_and_nms_free_no_suppression(self):
        output = np.zeros((1, 56, 8400), dtype=np.float32)
        output[0, :4, :3] = np.array([[100, 100, 100], [100, 100, 100], [20, 20, 20], [20, 20, 20]])
        output[0, 4, :2] = [0.9, 0.8]
        output[0, 5, 2] = 0.7
        self.assertEqual(len(decode(output, "raw", self.names, self.geometry)), 2)
        free = np.zeros((1, 300, 6), dtype=np.float32)
        free[0, :2] = [[90, 90, 110, 110, 0.9, 0], [90, 90, 110, 110, 0.8, 0]]
        self.assertEqual(len(decode(free, "nms-free", self.names, self.geometry)), 2)

    def test_reject_wrong_layout_nonfinite_or_class_id(self):
        with self.assertRaises(ValueError):
            validate_signature([1, 3, 640, 640], [1, 56, 8400], "nms-free")
        output = np.zeros((1, 300, 6), dtype=np.float32)
        for value in (52, 0.5, float("nan")):
            output[0, 0] = [1, 1, 10, 10, 0.9, value]
            with self.assertRaises(ValueError):
                decode(output, "nms-free", self.names, self.geometry)

    def test_runtime_hash_and_decoder_rejected_before_session(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            model = path / "detector.onnx"
            model.write_bytes(b"corrupt")
            manifest = {"schema_version": 1, "status": "verified-experimental", "preprocess": "letterbox-rgb-v1",
                        "mode": "raw", "decoder": "yolo26-raw-v1", "onnx_sha256": "0" * 64}
            (path / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "hash"):
                Detector(path / "manifest.json")
            manifest["decoder"] = "yolo26-nms-free-v1"
            (path / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "decoder"):
                Detector(path / "manifest.json")

    def test_parity_handles_topk_ties_but_rejects_real_changes(self):
        expected = np.zeros((1, 300, 6), dtype=np.float32)
        expected[0, :2] = [[10, 10, 20, 20, 0.9, 0], [20, 20, 30, 30, 0.9, 1]]
        actual = expected.copy()
        actual[0, :2] = actual[0, :2][::-1]
        self.assertEqual(compare_outputs(actual, expected, "nms-free"), 0)
        actual[0, 0, 5] = 3
        with self.assertRaises(ValueError):
            compare_outputs(actual, expected, "nms-free")
        actual = expected.copy()
        actual[0, 0, 0] += 5
        with self.assertRaises(AssertionError):
            compare_outputs(actual, expected, "nms-free")
        with self.assertRaises(AssertionError):
            compare_outputs(np.ones((1, 56, 8400)), np.zeros((1, 56, 8400)), "raw")

    def test_prepare_removes_cross_split_siblings_and_detects_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "data"
            source.mkdir()
            text = "names: " + repr(self.names)
            (source / "data.yaml").write_text(text)
            for index, split in enumerate(("test", "valid", "train")):
                (source / split / "images").mkdir(parents=True)
                (source / split / "labels").mkdir()
                for name in (split + ".rf.a", "related.rf." + str(index)):
                    Image.new("RGB", (32, 32), (index * 50, len(name), 10)).save(source / split / "images" / (name + ".png"))
                    (source / split / "labels" / (name + ".txt")).write_text("0 0.5 0.5 0.1 0.2\n")
            config = {"datasets": {"yolo26n": "data"}, "dataset_yaml_sha256": hashlib.sha256(text.encode()).hexdigest(),
                      "class_count": 52, "output": "artifacts", "dataset_source": "fixture", "dataset_license": "fixture"}
            result = prepare(root, config)
            self.assertEqual(result["excluded"], 2)
            prepared = Path(result["prepared"])
            manifest = verify_prepared(prepared)
            self.assertEqual(len(manifest["splits"]["train"]), 1)
            with self.assertRaises(FileExistsError):
                prepare(root, config)
            (source / "train/labels/train.rf.a.txt").write_text("0 0.1 0.1 0.1 0.1\n")
            with self.assertRaisesRegex(ValueError, "changed"):
                verify_prepared(prepared)


if __name__ == "__main__":
    unittest.main()
