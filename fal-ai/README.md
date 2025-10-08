# CE.SDK Processor Fal.AI Serverless App

> **We do not recommend running on fal.ai due to the lack of video acceleration support on the provided GPUs**

This example contains a private serverless app for [fal.ai](https://docs.fal.ai/private-serverless-apps) that provides both a UI and API for converting scene files and archives using the public `imgly/cesdk-processor` container image.

## Overview

The app leverages the CE.SDK Processor container to handle CE.SDK scene files and convert them to various output formats (primarily MP4 video). It runs on GPU-enabled infrastructure for optimal performance.

### Features

- **Scene File Processing**: Convert CE.SDK scene files (.scene) to MP4 videos or images
- **GPU Acceleration**: Uses NVIDIA L40 GPU for fast processing
- **RESTful API**: Simple HTTP endpoint for programmatic access
- **File Handling**: Automatic download/upload of input/output files
- **Smart Output Types**: Automatically detects output format and provides proper preview in FAL UI
  - Videos (.mp4, .mov, etc.) display with video player
  - Images (.jpg, .png, etc.) display with image viewer
- **Environment Configuration**: Supports custom codec and encoder settings

## Setup

1. Setup a `venv` with Python 3.13 locally (assuming `pyenv`): `pyenv install 3.13 --skip-existing && pyenv local 3.13 && python -m venv venv`
2. Activate venv: `source venv/bin/activate`
3. Install fal via pip `pip install fal`
4. Authenticate the fal cli `fal auth login`

## Usage

### Development/Testing

Launch the serverless app in an ephemeral fashion:

```bash
fal run --<YOUR_TEAM> processor_container.py::Processor
```

### Production Deployment

Deploy to production with a persistent URL:

```bash
# Set your license key as a secret (one-time setup)
fal secrets set IMGLY_LICENSE="your-license-key"

# Deploy to production
fal deploy --team <YOUR_TEAM> processor_container.py::Processor

# You'll get a persistent URL like:
# https://<app-id>-<team>.fal.run/
```

Replace `<YOUR_TEAM>` with your actual fal.ai team name.

### API Endpoint

The app exposes a single endpoint at `/` that accepts:

**Input:**

```json
{
  "file_url": "https://example.com/path/to/your/scene-file.scene"
}
```

**Output:**

For video files (.mp4, .mov, etc.):

```json
{
  "video": {
    "url": "https://fal.ai/files/processed_output.mp4",
    "content_type": "video/mp4",
    "file_name": "processed_output.mp4",
    "file_size": 1234567
  },
  "processing_time_seconds": 7.53,
  "gpu_used": true
}
```

For image files (.jpg, .png, etc.):

```json
{
  "image": {
    "url": "https://fal.ai/files/processed_output.png",
    "content_type": "image/png",
    "file_name": "processed_output.png",
    "file_size": 123456,
    "width": 1920,
    "height": 1080
  },
  "processing_time_seconds": 2.14,
  "gpu_used": true
}
```

### Environment Variables

The app requires the following environment variable to be set in your fal.ai secrets:

- `IMGLY_PROCESSOR_LICENSE`: Your CE.SDK Processor license key

## Technical Details

### Container Configuration

- **Base Image**: `imgly/cesdk-processor:1.57.0-nightly.20250722`
- **Python Version**: 3.13 (installed alongside existing Python)
- **GPU**: NVIDIA L40 with full NVENC support (required)
- **Codecs**: OSS codecs with hardware-accelerated NVENC H.264 encoding
- **Encoding**: GPU-accelerated via `nvh264enc` (mandatory for production performance)

### File Processing Flow

1. Download input file from provided URL
2. Generate output filename with `_processed.mp4` suffix
3. Execute cesdk-processor with GPU acceleration
4. Upload processed file to fal.ai storage
5. Return file URL in response

### Environment Configuration

The app automatically configures:

- `UBQ_AV_CODECS=oss`: Forces open-source codec usage
- `UBQ_AV_OVERRIDE_H264_ENCODER=nvh264enc`: Enables NVIDIA hardware encoding
- `IMGLY_LICENSE`: Set from fal.ai secrets for processor licensing

## Production Configuration

The app is configured with the following production settings:

- **Auto-scaling**: Scales to zero when idle (`min_replicas=0`)
- **Max scale**: Single instance only (`max_replicas=1`)
- **Concurrency**: Sequential processing - 1 request at a time (`max_concurrency=1`)
- **GPU**: L40 with full NVENC support for video encoding
- **Logging**: Minimal - only errors and warnings
- **Cleanup**: Automatic removal of temporary files

### Cost Optimization

- **Scale to zero**: No costs when idle
- **L40 GPU**: ~$1.89/hour when active
- **Estimated costs**:
  - Low usage (100 videos/month): ~$3-5/month
  - Medium usage (1000 videos/month): ~$30-50/month
  - High usage (10,000 videos/month): ~$300-500/month

To reduce costs further:

- Set `keep_warm=0` (default) to avoid keeping instances warm
- Consider batching requests to minimize cold starts
- Monitor usage patterns and adjust `max_replicas` accordingly
