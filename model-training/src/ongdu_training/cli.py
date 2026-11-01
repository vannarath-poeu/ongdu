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
    for name in ("inspect", "run") + STAGES:
        command = commands.add_parser(name)
        command.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
        command.add_argument("--model", choices=MODELS + ("all",),
                             default="all" if name in ("inspect", "run", "compare") else "yolo26n")
        if name == "inspect":
            command.add_argument("--check-labels", action="store_true")
        if name == "run":
            command.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        root, config = load_config(args.config)
        if args.command == "inspect":
            result = [inspect_dataset(root, config, model, args.check_labels)
                      for model in selected_models(args.model)]
        elif args.command == "run" and args.dry_run:
            result = execution_plan(root, config, args.model)
        else:
            run_stage(args.command)
            return 0
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, KeyError, NotImplementedError) as error:
        print("ongdu-training: {}".format(error), file=sys.stderr)
        return 2
