#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
VIDEO_DIR="$REPO_ROOT/assets/video"
ARCHIVE_PATH="$REPO_ROOT/assets/video.tar.gz"

if [ ! -d "$VIDEO_DIR" ]; then
  echo "Error: video directory not found: $VIDEO_DIR" >&2
  exit 1
fi

echo "Packing videos from $VIDEO_DIR -> $ARCHIVE_PATH"

# Create archive of the directory contents (not the directory itself)
cd "$VIDEO_DIR"

# Exclude any existing archive residing in assets directory when globbing up one level
tar -czf "$ARCHIVE_PATH" \
  --exclude="$(basename "$ARCHIVE_PATH")" \
  --exclude="*.DS_Store" \
  --no-xattrs \
  .

echo "Created archive: $ARCHIVE_PATH"


