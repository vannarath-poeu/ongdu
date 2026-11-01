"""Inspect the pinned checkpoint without executing its pickle or importing PyTorch."""
import argparse
import hashlib
import json
import pickletools
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = {
    'repository': 'mustafakemal0146/playing-cards-yolov8',
    'revision': 'f4ccffa44144733d60499033aa1dbfb56ae7d3f4',
    'file': 'playing_cards_model_0_playing-cards-colab.pt',
    'sha256': 'fe4299466afd493c30ef88e7a0daff16734eb2fb25a58bd15bbdbee4e5d51d09',
}


def inspect(path):
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != SOURCE['sha256']:
        raise ValueError('Checkpoint hash differs from pinned source')
    with zipfile.ZipFile(path) as archive:
        members = [n for n in archive.namelist() if n.endswith('/data.pkl')]
        if len(members) != 1:
            raise ValueError('Expected exactly one checkpoint pickle')
        ops = list(pickletools.genops(archive.read(members[0])))
    # Read only literal entries from the names dictionary; never unpickle downloaded code.
    start = next(i for i, (_, value, _) in enumerate(ops) if value == 'names')
    classes = []
    for op, value, _ in ops[start + 1:]:
        if op.name == 'SETITEMS':
            break
        if op.name == 'BINUNICODE':
            if value[-1:] not in 'CDHS' or value[:-1] not in ['2','3','4','5','6','7','8','9','10','J','Q','K','A']:
                raise ValueError('Unexpected fixed class name')
            classes.append({'id': len(classes), 'label': value, 'rank': value[:-1],
                            'suit': dict(C='clubs', D='diamonds', H='hearts', S='spades')[value[-1]]})
        elif op.name.startswith('BININT') and value != len(classes):
            raise ValueError('Non-contiguous class IDs')
    if len(classes) != 52 or len({c['label'] for c in classes}) != 52:
        raise ValueError('Checkpoint does not cover the ordinary deck')
    globals_found = [value for op, value, _ in ops if op.name == 'GLOBAL']
    return {'source': SOURCE, 'bytes': len(payload), 'classes': classes,
            'pickleGlobals': globals_found,
            'verification': 'Static pickle inspection only; runtime architecture and box policy still require validation.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.download:
        if args.checkpoint.exists():
            raise ValueError('Refusing to overwrite an existing checkpoint')
        url = f"https://huggingface.co/{SOURCE['repository']}/resolve/{SOURCE['revision']}/{SOURCE['file']}"
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = response.read(8 * 1024 * 1024 + 1)
        if hashlib.sha256(payload).hexdigest() != SOURCE['sha256']:
            raise ValueError('Downloaded checkpoint hash mismatch')
        args.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        args.checkpoint.write_bytes(payload)
    report = inspect(args.checkpoint)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
