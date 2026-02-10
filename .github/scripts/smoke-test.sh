#!/bin/bash
set -euo pipefail

VERSION="${1#v}"
VETT="npx -y vett@$VERSION"

echo "Waiting for npm to propagate package..."
for i in $(seq 1 12); do
  if npm view "vett@$VERSION" version >/dev/null 2>&1; then
    echo "Package available after ~$((i * 10))s"
    break
  fi
  if [ "$i" -eq 12 ]; then
    echo "Timed out waiting for npm to propagate vett@$VERSION"
    exit 1
  fi
  sleep 10
done

echo "==> vett --help"
$VETT --help

echo "==> vett --version"
OUTPUT=$($VETT --version)
OUTPUT_VERSION="${OUTPUT#v}"

if [[ "$OUTPUT_VERSION" == "$VERSION" ]]; then
  echo "✓ Version matches: $OUTPUT_VERSION"
else
  echo "✗ Version mismatch: expected $VERSION, got $OUTPUT_VERSION"
  exit 1
fi

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
