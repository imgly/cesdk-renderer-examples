# CE.SDK Renderer — AWS EC2 GPU Example

GPU-accelerated video rendering on AWS EC2 using the CE.SDK Renderer with NVIDIA NVENC hardware encoding.

## Overview

This example deploys the **avlicensed** CE.SDK Renderer as a Docker-based Express.js API on an AWS EC2 GPU instance. It uses NVIDIA NVENC for hardware video encoding, achieving ~4x faster render times compared to CPU-only encoding.

### Performance (56-second 1080p scene, 30 Mbps, 23.98 fps)

| Encoder                                  | Time    | Notes                          |
| ---------------------------------------- | ------- | ------------------------------ |
| `fluh264enc` (Fluendo software, default) | ~115 s  | CPU-bound encoding bottleneck  |
| `nvh264enc` (raw NVENC)                  | ~21 s   | Fastest, larger files          |
| `fluhwvanvench264enc` (Fluendo NVENC)    | ~27 s   | Better compression, licensed   |

## AWS Setup

### Recommended Configuration

| Setting       | Value                                                     |
| ------------- | --------------------------------------------------------- |
| AMI           | Deep Learning Base AMI with Single CUDA (Ubuntu 22.04)    |
| Instance type | **g6.2xlarge** (NVIDIA L4 24 GB, 8 vCPU, 32 GB RAM)      |
| Storage       | 50 GB gp3                                                 |
| Region        | Any region with g6 availability (e.g. `eu-central-1`)     |

### Prerequisites

- **EC2 quota**: "Running On-Demand G and VT instances" must be >= 8 vCPUs.
  Request an increase via **Service Quotas** in the AWS console if needed.
- **Security group**: Allow inbound TCP on ports **22** (SSH) and **8080** (API).
- **SSH key pair**: Configured for the instance.

### Quick Start

Run from your local machine — the script handles everything:

```bash
cd apps/cesdk_renderer_examples/aws-gpu
./setup.sh
```

It will ask for your EC2 IP, SSH key, and license key, then upload files, verify the GPU environment, and start the renderer automatically.

The API is then available at `http://<public-ip>:8080`.

## API

### `POST /render`

Renders a CE.SDK scene file to video or image.

**Request body:**

```json
{
  "file_url": "https://cdn.img.ly/assets/demo/v2/ly.img.video.template/templates/milli-surf-school.scene",
  "render_device": "gpu",
  "output_mime_type": "video/mp4",
  "debug": false,
  "video_render_options": {
    "videoBitrate": 30000000,
    "framerate": 23.98,
    "targetWidth": 1920,
    "targetHeight": 1080
  },
  "audio_render_options": {
    "sampleRate": 48000,
    "numberOfChannels": 2
  },
  "text_replacements": {
    "headline": "Hello World",
    "cta": "Buy Now"
  }
}
```

| Field                  | Type   | Default       | Description                                       |
| ---------------------- | ------ | ------------- | ------------------------------------------------- |
| `file_url`             | string | *required*    | URL to a `.scene` file                            |
| `render_device`        | string | `"auto"`      | `"auto"`, `"gpu"`, or `"cpu"`                     |
| `output_mime_type`     | string | `"video/mp4"` | Output MIME type                                  |
| `debug`                | bool   | `false`       | Enable verbose renderer logging                   |
| `video_render_options` | object | —             | Video encoding settings (bitrate, fps, resolution)|
| `audio_render_options` | object | —             | Audio encoding settings (sample rate, channels)   |
| `text_replacements`    | object | `{}`          | Key-value pairs for text placeholder replacement  |

**Response:** Binary file with `Content-Type` and `X-Processing-Time` headers.

### `GET /health`

Returns `{ "status": "ok" }`.

### Example

```bash
curl -X POST http://<public-ip>:8080/render \
  -H "Content-Type: application/json" \
  -d '{"file_url": "https://cdn.img.ly/assets/demo/v2/ly.img.video.template/templates/milli-surf-school.scene", "render_device": "gpu"}' \
  --output rendered.mp4
```

## NVENC Encoder Configuration

The `docker-compose.yml` sets environment variables to override the default Fluendo software encoder with NVENC hardware encoding:

```yaml
environment:
  - UBQ_AV_OVERRIDE_H264_ENCODER=fluhwvanvench264enc
  - UBQ_AV_OVERRIDE_H265_ENCODER=nvh265enc
```

### Available H.264 Encoders

| Element                  | Type                  | Speed   | File Size |
| ------------------------ | --------------------- | ------- | --------- |
| `fluh264enc`             | Fluendo software (CPU)| Slow    | Medium    |
| `nvh264enc`              | Raw NVIDIA NVENC      | Fastest | Larger    |
| `fluhwvanvench264enc`    | Fluendo NVENC wrapper  | Fast    | Smaller   |

To switch encoders, change the `UBQ_AV_OVERRIDE_H264_ENCODER` value in `docker-compose.yml` and restart.

### Verifying NVENC is Active

Monitor GPU utilization during a render:

```bash
# The "enc" column should show 10-20% when NVENC is encoding
nvidia-smi dmon -s pucvmet -d 1 -c 60
```

## Monitoring

```bash
# Container logs
docker compose logs -f

# GPU utilization during render
nvidia-smi dmon -s pucvmet -d 1

# Container status
docker compose ps
```

## Troubleshooting

| Symptom                        | Cause                                  | Fix                                                        |
| ------------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| GPU and CPU render times equal | NVENC not enabled                      | Add `UBQ_AV_OVERRIDE_H264_ENCODER` env var                 |
| `enc` column stays at 0%       | Encoder override not applied           | Rebuild container: `docker compose up -d --build`          |
| Container won't start          | Missing `CESDK_LICENSE`                | Create `.env` file with your license key                   |
| SSH connection refused          | Security group missing port 22         | Add inbound rule for TCP 22                                |
| API unreachable                | Security group missing port 8080       | Add inbound rule for TCP 8080                              |
| Quota exceeded on launch       | Insufficient G-instance vCPU quota     | Request increase in AWS Service Quotas                     |
