#!/usr/bin/env bash
set -euo pipefail

# Extract a clean message for a given tag.
# - Annotated tag: returns tag message
# - Lightweight/missing tag: returns empty

TAG_NAME="${1:-}"

if [[ -z "${TAG_NAME}" ]]; then
	echo ""
	exit 0
fi

if ! git rev-parse -q --verify "refs/tags/${TAG_NAME}" >/dev/null 2>&1; then
	git fetch --tags --quiet || true
fi

if ! git rev-parse -q --verify "refs/tags/${TAG_NAME}" >/dev/null 2>&1; then
	echo ""
	exit 0
fi

OBJECT_TYPE="$(git cat-file -t "refs/tags/${TAG_NAME}" 2>/dev/null || true)"

if [[ "${OBJECT_TYPE}" == "tag" ]]; then
	git tag -l --format='%(contents)' "${TAG_NAME}" | sed 's/[\r\t]*$//'
else
	echo ""
fi
