from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from ongdu_training.evaluate import evaluate_placeholder, metric_report, verify_placeholder


def fake_metrics():
    return SimpleNamespace(
        box=SimpleNamespace(ap_class_index=[1], p=[0.8], r=[0.7], ap50=[0.9], ap=[0.6],
                            mp=0.8, mr=0.7, map50=0.9, map=0.6),
        speed={"inference": 2.5},
    )


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name).resolve()
        self.root = self.repo / "model-training"
        self.root.mkdir()
        self.weights = self.root / "weights/placeholder.pt"
        self.weights.parent.mkdir()
        self.weights.write_bytes(b"verified fixture")
        provenance = self.repo / "models/card-recognition/source-inspection.json"
        provenance.parent.mkdir(parents=True)
        self.names = ["card-{}".format(i) for i in range(52)]
        provenance.write_text(json.dumps({
            "source": {"sha256": hashlib.sha256(self.weights.read_bytes()).hexdigest()},
            "classes": [{"label": label} for label in self.names],
        }))
        self.dataset = self.root / "data/fixture"
        for split in ("train", "valid", "test"):
            for folder in ("images", "labels"):
                (self.dataset / split / folder).mkdir(parents=True)
            for name in ("b", "a"):
                (self.dataset / split / "images" / (name + ".jpg")).write_bytes(b"fixture image")
                (self.dataset / split / "labels" / (name + ".txt")).write_text("1 0.5 0.5 0.1 0.2\n")
        (self.dataset / "data.yaml").write_bytes(b"pinned fixture metadata")
        self.config = {
            "weights": {"yolov8n": "weights/placeholder.pt"},
            "datasets": {"yolov8n": "data/fixture"}, "class_count": 52,
            "dataset_yaml_sha256": hashlib.sha256(b"pinned fixture metadata").hexdigest(),
            "dataset_source": "fixture", "output": "artifacts", "training": {"seed": 42},
        }

    def fake_runtime(self, names=None, seen_count=None):
        self.arguments = {}
        callbacks = {"on_val_end": []}
        def validate(**kwargs):
            self.arguments.update(kwargs)
            self.assertTrue(Path(kwargs["data"]).is_file())
            data = json.loads(Path(kwargs["data"]).read_text())
            count = len(list(Path(data[kwargs["split"]]).glob("*.jpg")))
            metrics = fake_metrics()
            validator = SimpleNamespace(seen=count if seen_count is None else seen_count, metrics=metrics)
            for callback in callbacks["on_val_end"]:
                callback(validator)
            return metrics
        self.model = SimpleNamespace(names=dict(enumerate(names or self.names)), val=validate,
                                     add_callback=lambda event, callback: callbacks[event].append(callback))
        stack = ExitStack()
        stack.enter_context(patch.dict("os.environ"))
        stack.enter_context(patch.dict("sys.modules", {
            "torch": SimpleNamespace(__version__="fixture", backends=SimpleNamespace(
                mps=SimpleNamespace(is_available=lambda: False)),
                cuda=SimpleNamespace(is_available=lambda: False)),
            "ultralytics": SimpleNamespace(YOLO=lambda *args, **kwargs: self.model,
                                           settings=SimpleNamespace(update=lambda values: None)),
        }))
        stack.enter_context(patch("ongdu_training.evaluate.metadata.version", return_value="8.4.197"))
        return stack

    def test_absent_classes_are_not_reported_as_mean_ap(self):
        report = metric_report(fake_metrics(), ["AS", "KS"])
        self.assertIsNone(report["per_class"][0]["metrics"])
        self.assertEqual(report["per_class"][1]["metrics"]["map50_95"], 0.6)

    def test_missing_or_changed_weights_fail_before_runtime_import(self):
        self.weights.write_bytes(b"wrong model")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            evaluate_placeholder(self.root, self.config)
        self.weights.unlink()
        with self.assertRaisesRegex(ValueError, "weights missing"):
            verify_placeholder(self.root, self.weights)

    def test_evaluation_writes_provenance_and_uses_correct_split(self):
        with self.fake_runtime():
            result = evaluate_placeholder(self.root, self.config, split="test", limit=1,
                                          output="artifacts/benchmark")
        report_path = Path(result["report"])
        report = json.loads(report_path.read_text())
        self.assertFalse(hasattr(self.model, "validator"))
        snapshot = json.loads((report_path.parent / "metrics.json").read_text())
        self.assertEqual(snapshot["images_seen"], 1)
        self.assertEqual(snapshot["results"], report["results"])
        self.assertTrue(report["dataset"]["subset"])
        self.assertEqual(report["dataset"]["boxes"], 1)
        self.assertEqual(report["dataset"]["split"], "test")
        manifest = json.loads((report_path.parent / "images.json").read_text())
        self.assertEqual(manifest[0]["image"], "a.jpg")
        data = json.loads(Path(self.arguments["data"]).read_text())
        view = Path(data["test"])
        self.assertTrue(view.is_absolute())
        self.assertTrue((view / "a.jpg").is_symlink())
        self.assertFalse(self.arguments["half"])
        self.assertFalse(self.arguments["save_json"])
        self.assertEqual(self.arguments["conf"], 0.001)
        self.assertFalse(list(self.dataset.rglob("*.cache")))

    def test_skipped_images_keep_metrics_but_do_not_create_success_report(self):
        with self.fake_runtime(seen_count=1):
            with self.assertRaisesRegex(RuntimeError, "evaluated 1 of 2"):
                evaluate_placeholder(self.root, self.config, output="artifacts/incomplete")
        self.assertTrue((self.root / "artifacts/incomplete/metrics.json").is_file())
        self.assertFalse((self.root / "artifacts/incomplete/report.json").exists())

    def test_class_order_mismatch_rejected(self):
        with self.fake_runtime(list(reversed(self.names))):
            with self.assertRaisesRegex(ValueError, "class order"):
                evaluate_placeholder(self.root, self.config)

    def test_output_not_overwritten(self):
        (self.root / "artifacts/existing").mkdir(parents=True)
        with self.fake_runtime():
            with self.assertRaises(FileExistsError):
                evaluate_placeholder(self.root, self.config, output="artifacts/existing")

    def test_invalid_options_rejected(self):
        for options in ({"batch": 0}, {"limit": 0}, {"split": "train"}):
            with self.assertRaises(ValueError):
                evaluate_placeholder(self.root, self.config, **options)

    def test_unavailable_acceleration_fails_clearly(self):
        with self.fake_runtime():
            with self.assertRaisesRegex(ValueError, "MPS is unavailable"):
                evaluate_placeholder(self.root, self.config, device="mps")


if __name__ == "__main__":
    unittest.main()
