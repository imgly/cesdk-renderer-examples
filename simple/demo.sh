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
    -e "IMGLY_LICENSE=${IMGLY_LICENSE:-}" \
    -v "$(pwd)/output:/output" \
    "docker.io/imgly/cesdk-renderer:${CESDK_RENDERER_VERSION}" \
    --input "${INPUT_FILE:-/opt/cesdk-renderer/assets/demo/v2/ly.img.template/templates/cesdk_postcard_1.scene}" \
    --output "${OUTPUT_FILE:-/output/postcard.jpg}" \
    --render-device auto \
    "$@"
