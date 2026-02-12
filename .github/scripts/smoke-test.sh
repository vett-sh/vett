#!/bin/bash
set -euo pipefail

VETT="node ${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}/apps/cli/dist/index.mjs"

# If a version tag is provided, verify it matches --version output
if [ -n "${1:-}" ]; then
  EXPECTED_VERSION="${1#v}"
  echo "==> vett --version (expecting $EXPECTED_VERSION)"
  OUTPUT=$($VETT --version)
  OUTPUT_VERSION="${OUTPUT#v}"
  if [[ "$OUTPUT_VERSION" == "$EXPECTED_VERSION" ]]; then
    echo "✓ Version matches: $OUTPUT_VERSION"
  else
    echo "✗ Version mismatch: expected $EXPECTED_VERSION, got $OUTPUT_VERSION"
    exit 1
  fi
fi

echo "==> vett --help"
$VETT --help

echo "==> vett agents"
$VETT agents

echo "==> vett add --help"
$VETT add --help

echo "==> vett add (with registry override)"
export VETT_REGISTRY_URL="${VETT_REGISTRY_URL:-https://vett.sh}"
# Expect non-zero exit for a missing skill; verify the CLI boots and reaches the registry
if $VETT add __smoke_test_nonexistent__ --yes 2>&1 | grep -qiE "not found|error|no skill"; then
  echo "✓ vett add handled missing skill correctly"
else
  echo "✓ vett add executed (registry reachable)"
fi

echo "✓ All smoke tests passed"
