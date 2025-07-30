# IMG.LY Processor Fal.AI Serverless App

This repository contains a private serverless app for [fal.ai](https://docs.fal.ai/private-serverless-apps) that provides both a UI and API for converting scene files and archives using the public `imgly/imgly-processor` container image.

## Overview

The app leverages the IMG.LY Processor container to handle CE.SDK scene files and convert them to various output formats (primarily MP4 video). It runs on GPU-enabled infrastructure for optimal performance.

### Features

- **Scene File Processing**: Convert CE.SDK scene files (.scene) to MP4 videos
- **GPU Acceleration**: Uses NVIDIA GPU (A100) for fast processing
- **RESTful API**: Simple HTTP endpoint for programmatic access
- **File Handling**: Automatic download/upload of input/output files
- **Environment Configuration**: Supports custom codec and encoder settings

## Usage

### Deploy and Run

Launch the serverless app in an ephemeral fashion:

```bash
fal run --<YOUR_TEAM> processor_container.py::Processor
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
```json
{
  "file": {
    "url": "https://fal.ai/files/processed_output.mp4"
  }
}
```

### Environment Variables

The app requires the following environment variable to be set in your fal.ai secrets:

- `IMGLY_PROCESSOR_LICENSE`: Your IMG.LY Processor license key

## Testing

A comprehensive test script is included to validate the processing logic locally without requiring fal.ai deployment.

### Run Tests

```bash
python test_processor.py
```

The test script performs the following validations:

1. **Basic Processing Logic**: Tests the core file processing workflow
2. **Real File Handling**: Tests with the included `test.scene` file
3. **Full Pipeline Simulation**: End-to-end processing simulation
4. **Command Construction**: Validates imgly-processor command generation

### Test Requirements

- Python 3.6+
- The `test.scene` file should be present in the same directory for complete testing

### Test Output

The test script provides detailed logging showing:
- File download simulation
- Processing command construction
- Mock execution results
- File size and path information
- Success/failure status of each test phase

## Technical Details

### Container Configuration

- **Base Image**: `imgly/imgly-processor:1.57.0-nightly.20250722`
- **Python Version**: 3.11 (installed alongside existing Python)
- **GPU**: NVIDIA A100 for hardware acceleration
- **Codecs**: Configured for OSS codecs with NVENC H.264 encoding

### File Processing Flow

1. Download input file from provided URL
2. Generate output filename with `_processed.mp4` suffix
3. Execute imgly-processor with GPU acceleration
4. Upload processed file to fal.ai storage
5. Return file URL in response

### Environment Configuration

The app automatically configures:
- `UBQ_AV_CODECS=oss`: Forces open-source codec usage
- `UBQ_AV_OVERRIDE_H264_ENCODER=nvh264enc`: Enables NVIDIA hardware encoding
- `IMGLY_LICENSE`: Set from fal.ai secrets for processor licensing