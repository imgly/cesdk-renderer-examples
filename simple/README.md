# Exporting a simple scene using the CE.SDK Renderer docker container commandline interface

## Running the sample

1. Make sure you've set up [Docker](https://docs.docker.com/engine/install/) or a compatible container engine on your machine.
2. Run `./demo.sh` in your shell, or `CESDK_LICENSE=... ./demo.sh` if you already have a valid license key.

## GPU Acceleration

For GPU-accelerated rendering on systems with NVIDIA GPUs, you need to:

1. Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
2. Configure Docker to use the NVIDIA runtime
3. Add both `--runtime=nvidia --gpus all` flags to the docker run command

Example with GPU acceleration:
```bash
docker run --rm --runtime=nvidia --gpus all -it \
    -e "CESDK_LICENSE=${CESDK_LICENSE}" \
    -v "$(pwd)/output:/output" -v "$(pwd)/input:/input" \
    "docker.io/imgly/cesdk-renderer:latest" \
    --input /opt/cesdk-renderer/assets/demo/v3/ly.img.template/templates/cesdk_postcard_1.scene \
    --output /output/
```

**Note:** Both `--runtime=nvidia` and `--gpus all` are required. Using only `--gpus all` may result in EGL initialization errors.
