"""Thin CLI; no dependency installation, implicit downloads, or training at import."""

import argparse
import json
import sys
from pathlib import Path

from .pipeline import (DEFAULT_CONFIG, MODELS, STAGES, execution_plan,
                       inspect_dataset, load_config, run_stage, selected_models)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("inspect", "run", "predict", "compare-ocr") + STAGES:
        command = commands.add_parser(name)
        command.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
        command.add_argument("--model", choices=("yolov8n",) if name == "compare-ocr" else MODELS + ("all",),
                             default="yolov8n" if name in ("evaluate", "compare-ocr") else
                             "all" if name in ("inspect", "compare") else "yolo26n")
        if name in ("prepare", "train", "export", "run"):
            command.add_argument("--output", type=Path)
        if name in ("train", "run"):
            command.add_argument("--device", choices=("cpu", "mps", "0", "auto"), default="auto")
            command.add_argument("--batch", type=int, help="Override the configured training batch size")
            command.add_argument("--epochs", type=int)
        if name == "train":
            command.add_argument("--resume", action="store_true")
        if name in ("train", "export", "evaluate"):
            command.add_argument("--prepared", type=Path)
        if name in ("prepare",):
            command.add_argument("--limit", type=int)
        if name == "export":
            command.add_argument("--weights", type=Path, required=True)
            command.add_argument("--mode", choices=("raw", "nms-free", "all"), default="all")
        if name == "predict":
            command.add_argument("--manifest", type=Path, required=True)
            command.add_argument("--image", type=Path, required=True)
            command.add_argument("--confidence", type=float, default=0.25)
            command.add_argument("--iou", type=float, default=0.5)
        if name == "compare-ocr":
            command.add_argument("--output", type=Path, required=True)
            selection = command.add_mutually_exclusive_group()
            selection.add_argument("--limit", type=int, default=100)
            selection.add_argument("--all-images", action="store_true")
            command.add_argument("--seed", type=int, default=42)
            command.add_argument("--confidence", type=float, default=0.25)
            command.add_argument("--iou", type=float, default=0.7)
            command.add_argument("--cache", type=Path, default=Path("artifacts/ocr-cache"))
            command.add_argument("--timeout", type=float, default=120)
        if name == "evaluate":
            command.add_argument("--weights", type=Path)
            command.add_argument("--split", choices=("val", "test"), default="val")
            command.add_argument("--device", choices=("cpu", "mps", "0", "auto"), default="cpu")
            command.add_argument("--batch", type=int, default=4)
            command.add_argument("--limit", type=int, help="Evaluate the first N sorted images (smoke run only)")
            command.add_argument("--output", type=Path, help="New report directory, relative to model-training")
        if name == "inspect":
            command.add_argument("--check-labels", action="store_true")
        if name == "run":
            command.add_argument("--dry-run", action="store_true")
            command.add_argument("--smoke", action="store_true")
    args = parser.parse_args(argv)
    try:
        root, config = load_config(args.config)
        if args.command == "inspect":
            result = [inspect_dataset(root, config, model, args.check_labels)
                      for model in selected_models(args.model)]
        elif args.command == "run" and args.dry_run:
            result = execution_plan(root, config, args.model)
        elif args.command == "evaluate":
            if args.prepared:
                from .workflow import evaluate_candidate
                if not args.weights or not args.output or args.limit:
                    raise ValueError("Candidate evaluation requires --weights, --prepared, --output; prepare subsets first")
                result = evaluate_candidate(root, config, weights=args.weights, prepared=args.prepared,
                                            output=args.output, split=args.split, device=args.device, batch=args.batch)
            else:
                if args.model != "yolov8n":
                    raise ValueError("Candidate evaluation requires --prepared")
                from .evaluate import evaluate_placeholder
                result = evaluate_placeholder(root, config, weights=args.weights, split=args.split,
                                              device=args.device, batch=args.batch, limit=args.limit,
                                              output=args.output)
        elif args.command == "prepare":
            from .training import prepare
            if args.model == "all":
                raise ValueError("Prepare one common dataset with --model yolo26n")
            result = prepare(root, config, args.model, output=args.output, limit=args.limit)
        elif args.command == "train":
            from .training import train
            if args.model == "all":
                raise ValueError("Train one architecture per command")
            result = train(root, config, args.model, prepared=args.prepared, output=args.output,
                           epochs=args.epochs, device=args.device, batch=args.batch, resume=args.resume)
        elif args.command == "export":
            from .export import export_onnx
            if args.model != "yolo26n" or not args.prepared or not args.output:
                raise ValueError("YOLO26 export requires --prepared and --output")
            result = export_onnx(root, config, weights=args.weights, prepared=args.prepared, output=args.output,
                                 modes=("raw", "nms-free") if args.mode == "all" else (args.mode,))
        elif args.command == "predict":
            from .onnx_runtime import Detector
            result = Detector((root / args.manifest).resolve()).predict((root / args.image).resolve(),
                                     confidence=args.confidence, iou=args.iou)
        elif args.command == "compare-ocr":
            from .compare_ocr import compare_ocr
            result = compare_ocr(root, config, output=args.output, limit=None if args.all_images else args.limit,
                                 seed=args.seed, confidence=args.confidence, iou=args.iou,
                                 cache=args.cache, timeout=args.timeout)
        elif args.command == "run":
            from .workflow import run
            if args.model != "yolo26n" or not args.output:
                raise ValueError("YOLO26 run requires --model yolo26n --output NEW_DIRECTORY")
            result = run(root, config, output=args.output, smoke=args.smoke,
                         epochs=args.epochs, device=args.device, batch=args.batch)
        else:
            run_stage(args.command)
            return 0
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, NotImplementedError) as error:
        print("ongdu-training: {}".format(error), file=sys.stderr)
        return 2
