#!/usr/bin/env python3
"""Decompress lesson-flow compressed payload strings.

Usage:
  python scripts/decompress_payload.py --encoding deflate-base64 --data "<base64>"
  python scripts/decompress_payload.py --file payload.txt
"""

import argparse
import base64
import json
import sys
import zlib


def decompress_deflate_base64(raw: str):
    compressed = base64.b64decode(raw)
    decoded = zlib.decompress(compressed)
    return json.loads(decoded.decode('utf-8'))


def main():
    parser = argparse.ArgumentParser(description='Decompress lesson-flow payloads.')
    parser.add_argument('--encoding', default='deflate-base64', help='Payload encoding type')
    parser.add_argument('--data', default='', help='Compressed payload string')
    parser.add_argument('--file', default='', help='Read compressed payload string from file')
    args = parser.parse_args()

    raw = args.data
    if args.file:
      with open(args.file, 'r', encoding='utf-8') as handle:
          raw = handle.read().strip()

    if not raw:
      print('No payload data provided.', file=sys.stderr)
      sys.exit(1)

    if args.encoding != 'deflate-base64':
      print(f'Unsupported encoding: {args.encoding}', file=sys.stderr)
      sys.exit(2)

    payload = decompress_deflate_base64(raw)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
