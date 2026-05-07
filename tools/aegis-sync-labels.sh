#!/usr/bin/env bash
# aegis-sync-labels.sh -- Sync GitHub labels from .github/labels.yml
# Usage: bash tools/aegis-sync-labels.sh [--dry-run]
#
# Requires: gh CLI authenticated, yq or python3
# Run once locally after repo setup.

set -euo pipefail

REPO="mr-phariyawit/kam-tong-ham"
LABELS_FILE=".github/labels.yml"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] Would sync labels from $LABELS_FILE to $REPO"
fi

if [[ ! -f "$LABELS_FILE" ]]; then
  echo "Error: $LABELS_FILE not found"
  exit 1
fi

# Parse YAML with python3 (available on macOS + most CI)
python3 -c "
import yaml, sys, subprocess

with open('$LABELS_FILE') as f:
    labels = yaml.safe_load(f)

for label in labels:
    name = label['name']
    color = label['color'].lstrip('#')
    desc = label.get('description', '')
    dry = $( [[ "$DRY_RUN" == "true" ]] && echo "True" || echo "False" )

    if dry:
        print(f'[dry-run] Would create/update: {name} (#{color}) -- {desc}')
    else:
        # Try to create; if exists, update
        result = subprocess.run(
            ['gh', 'label', 'create', name, '--color', color, '--description', desc, '--repo', '$REPO', '--force'],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f'OK: {name}')
        else:
            print(f'WARN: {name} -- {result.stderr.strip()}')
"

echo ""
echo "Done. Labels synced to $REPO"
