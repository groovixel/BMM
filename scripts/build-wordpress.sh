#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Install once with: npm ci --prefix wordpress/build-tools
node scripts/build-wordpress.mjs
