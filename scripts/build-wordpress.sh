#!/usr/bin/env bash
# Build the BDS Marvel React app for embedding inside WordPress, then copy the
# output into the WordPress plugin folder.
#
# Usage:
#   REACT_APP_BACKEND_URL="https://api.yourdomain.com" ./scripts/build-wordpress.sh
#
# If REACT_APP_BACKEND_URL is not set, the current preview backend is used.
set -euo pipefail

cd "$(dirname "$0")/../frontend"

BACKEND_URL="${REACT_APP_BACKEND_URL:-https://1b725aca-9f3f-4243-a65d-8126c0b46c88.preview.emergentagent.com}"

echo ">> Building BDS Marvel app for WordPress embed"
echo ">> Backend API URL baked into bundle: $BACKEND_URL"

REACT_APP_WORDPRESS_MODE=true \
REACT_APP_BACKEND_URL="$BACKEND_URL" \
INLINE_RUNTIME_CHUNK=false \
DISABLE_EMERGENT_OVERLAY=true \
GENERATE_SOURCEMAP=false \
yarn build

PLUGIN_BUILD="../wordpress/bds-marvel-app/build"
rm -rf "$PLUGIN_BUILD"
cp -r build "$PLUGIN_BUILD"

echo ">> Done."
echo ">> Plugin is ready at: wordpress/bds-marvel-app/"
echo ">> Zip it and install in WordPress, then add the [bds_marvel_app] shortcode to a page."
