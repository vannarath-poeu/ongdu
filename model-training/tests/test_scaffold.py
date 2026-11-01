import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from ongdu_training.cli import main
from ongdu_training.pipeline import execution_plan, inspect_dataset, load_config


class ScaffoldTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        dataset = self.root / "data" / "fixture"
        dataset.mkdir(parents=True)
        yaml_bytes = b"fixture export metadata"
        (dataset / "data.yaml").write_bytes(yaml_bytes)
        for split in ("train", "valid", "test"):
            for folder in ("images", "labels"):
                (dataset / split / folder).mkdir(parents=True)
            (dataset / split / "images" / "card.jpg").write_bytes(b"fixture")
            (dataset / split / "labels" / "card.txt").write_text("0 0.5 0.5 0.2 0.3\n")
        self.config = {
            "schema_version": 1, "class_count": 52, "joker_training_ready": False,
            "dataset_yaml_sha256": hashlib.sha256(yaml_bytes).hexdigest(),
            "datasets": {name: "data/fixture" for name in ("yolo26n", "yolov8n")},
            "weights": {name: "weights/{}.pt".format(name) for name in ("yolo26n", "yolov8n")},
            "output": "artifacts", "training": {},
        }
        self.config_path = self.root / "configs" / "pipeline.json"
        self.config_path.parent.mkdir()
        self.config_path.write_text(json.dumps(self.config))

    def test_paths_are_relative_to_project_not_working_directory(self):
        root, config = load_config(self.config_path)
        plan = execution_plan(root, config)
        self.assertEqual(plan["candidates"][0]["dataset"], str(self.root / "data/fixture"))
        self.assertEqual(plan["candidates"][0]["export_modes"], ["raw", "nms-free"])
        self.assertEqual(plan["candidates"][1]["export_modes"], ["raw"])
        self.assertFalse(plan["candidates"][0]["weights_present"])
        self.assertFalse((self.root / "artifacts").exists())

    def test_inventory_and_label_validation(self):
        report = inspect_dataset(self.root, self.config, "yolo26n", True)
        self.assertEqual(report["splits"]["train"]["boxes"], 1)
        self.assertFalse(report["joker_training_ready"])

    def test_changed_metadata_requires_audit(self):
        (self.root / "data/fixture/data.yaml").write_text("different mapping")
        with self.assertRaisesRegex(ValueError, "metadata changed"):
            inspect_dataset(self.root, self.config, "yolo26n")

    def test_missing_labels_and_bad_values_fail(self):
        label = self.root / "data/fixture/train/labels/card.txt"
        for text in ("52 0.5 0.5 0.1 0.1", "0 nan 0.5 0.1 0.1", "0 0.5 0.5 0 0.1"):
            label.write_text(text)
            with self.assertRaises(ValueError):
                inspect_dataset(self.root, self.config, "yolo26n", True)
        label.unlink()
        with self.assertRaisesRegex(ValueError, "unmatched"):
            inspect_dataset(self.root, self.config, "yolo26n")

    def test_dry_run_is_explicit_and_does_not_write(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main(["run", "--dry-run", "--config", str(self.config_path)])
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "scaffold-only")
        self.assertFalse((self.root / "artifacts").exists())

    def test_unimplemented_stages_do_not_report_success(self):
        with contextlib.redirect_stderr(io.StringIO()) as error:
            status = main(["run", "--config", str(self.config_path)])
        self.assertEqual(status, 2)
        self.assertIn("not implemented", error.getvalue())


if __name__ == "__main__":
    unittest.main()
