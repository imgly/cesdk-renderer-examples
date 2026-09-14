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
# Remove `--runtime=nvidia --gpus all` if running on a system without NVIDIA GPU.
docker run --rm --runtime=nvidia --gpus all -it \
    -e "CESDK_LICENSE=${CESDK_LICENSE:-}" \
    -v "$(pwd)/output:/output" -v "$(pwd)/input:/input" \
    "docker.io/imgly/cesdk-renderer:${CESDK_RENDERER_VERSION}" \
    --input "${INPUT_FILE:-/opt/cesdk-renderer/assets/demo/v3/ly.img.template/templates/cesdk_postcard_1.scene}" \
    --output "${OUTPUT_FILE:-/output/}"
    "$@"
