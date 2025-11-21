#!/bin/bash
set -euo pipefail

# Load the license from the .env file if it exists (optional)
if [[ -f .env ]]; then
  . .env
fi

# Set the CESDK_RENDERER_VERSION to the latest version if not explicitly overridden
CESDK_RENDERER_VERSION=${CESDK_RENDERER_VERSION:-latest}

# Create the input and output directories if missing and set permissions
mkdir -p input output
chmod 0777 input output

# Run the renderer on one of the template scenes
# Add `--gpus all` to Docker arguments after `--rm` to use GPU rendering if an NVIDIA GPU is available.
docker run --rm -it \
    -e "CESDK_LICENSE=${CESDK_LICENSE:-}" \
    -v "$(pwd)/output:/output" -v "$(pwd)/input:/input" \
    "docker.io/imgly/cesdk-renderer-assetless:${CESDK_RENDERER_VERSION}" \
    --input "${INPUT_FILE:?INPUT_FILE must be provided}" \
    --output "${OUTPUT_FILE:-/output/}"
    "$@"
