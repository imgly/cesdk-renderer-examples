import subprocess
import fal
import os
import time
import sys
import traceback

from fal.container import ContainerImage
from pydantic import BaseModel
from fal.toolkit import File, Image, Video, download_file
from typing import Union


# Define a custom container image for the cesdk-processor
# This image is based on the nightly version of cesdk-processor
# and includes Python 3.11 installed via the deadsnakes PPA.
custom_image = ContainerImage.from_dockerfile_str(
    """
    FROM imgly/cesdk-processor:1.57.0-nightly.20250722

    # Switch to root to install packages
    USER root

    # Add deadsnakes PPA and install Python 3.13
    RUN apt-get update && \
        apt-get install -y software-properties-common && \
        add-apt-repository -y ppa:deadsnakes/ppa && \
        apt-get update && \
        apt-get install -y python3.13 python3.13-venv python3.13-dev && \
        ln -sf /usr/bin/python3.13 /usr/bin/python && \
        python --version

    # Set environment to ensure libraries are found
    ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/local/cuda-12/lib64:/usr/lib/x86_64-linux-gnu:/usr/local/lib:${LD_LIBRARY_PATH}
    """
)

class Input(BaseModel):
    file_url: str
    force_cpu: bool = False  # Optional flag to force CPU encoding for testing

class ImageOutput(BaseModel):
    image: Image
    processing_time_seconds: float
    gpu_used: bool

class VideoOutput(BaseModel):
    video: Video
    processing_time_seconds: float
    gpu_used: bool

class FileOutput(BaseModel):
    file: File
    processing_time_seconds: float
    gpu_used: bool

class Processor(fal.App, image=custom_image, kind="container"):
    # L40 has full NVENC support for video encoding
    # While more expensive, it's required for proper hardware-accelerated video processing
    # Note: T4 has limited NVENC (max 2 concurrent streams), L40 has unlimited NVENC sessions
    machine_type = "GPU-L40"

    # Production configuration
    min_replicas = 0  # Scale to zero when idle (cost optimization)
    max_replicas = 1  # Single instance only - no parallel processing
    max_concurrency = 1  # Process one request at a time per instance. We recommend a higher number to fully utilize the GPU.
    keep_warm = 0  # Set to 1 if you want to avoid cold starts (increases cost)

    @fal.endpoint("/")
    def process(self, input: Input) -> Union[VideoOutput, ImageOutput, FileOutput]:
        try:
            # Download the input file
            input_file = download_file(input.file_url, target_dir="/tmp")

            # Check if file exists
            if not os.path.exists(input_file):
                print(f"ERROR: Downloaded file not found: {input_file}", flush=True)
                raise FileNotFoundError(f"Downloaded file not found: {input_file}")

            # Generate output file path
            from pathlib import Path
            input_path = Path(input_file)
            output_file = str(input_path.parent / (input_path.stem + '_processed.mp4'))

            # Set additional environment variables for the subprocess
            # Create a clean environment copy
            process_env = os.environ.copy()

            # Get the license from fal secret and set it for the subprocess
            license_key = os.environ.get('IMGLY_LICENSE')
            if not license_key:
                print("WARNING: IMGLY_LICENSE not found in environment - processor may fail. Please set it in Fal secrets.", flush=True)

            # Ensure library paths are set correctly for production
            lib_paths = [
                "/usr/local/cuda/lib64",
                "/usr/local/cuda-12/lib64",
                "/usr/lib/x86_64-linux-gnu",
                "/usr/local/lib",
            ]
            existing_ld_path = process_env.get('LD_LIBRARY_PATH', '')
            process_env['LD_LIBRARY_PATH'] = ':'.join(lib_paths) + (':' + existing_ld_path if existing_ld_path else '')

            # Force OSS codecs since commercial codec licensing is not set up in production yet
            process_env['UBQ_AV_CODECS'] = 'oss'

            # Try different encoder configurations based on what's actually available
            if input.force_cpu:
                process_env['UBQ_AV_OVERRIDE_H264_ENCODER'] = 'x264enc'
            else:
                # Try to force NVENC (may fail if not available)
                process_env['UBQ_AV_OVERRIDE_H264_ENCODER'] = 'nvh264enc'

            # Add CUDA-specific paths for NVENC
            process_env['CUDA_HOME'] = '/usr/local/cuda'
            process_env['CUDA_PATH'] = '/usr/local/cuda'

            # Minimal debug logging
            process_env['GST_DEBUG'] = '*:1'

            # Ensure GStreamer plugin path includes NVIDIA plugins
            gst_paths = [
                '/usr/lib/x86_64-linux-gnu/gstreamer-1.0',
                '/usr/local/lib/gstreamer-1.0',
                '/usr/lib/gstreamer-1.0',
                '/opt/nvidia/gstreamer-1.0'  # Add NVIDIA-specific path
            ]
            process_env['GST_PLUGIN_PATH'] = ':'.join(gst_paths)

            # Run the cesdk-processor
            processor_path = "/opt/cesdk-processor/cesdk-processor"
            cmd = [processor_path, "--input", str(input_file), "--output", output_file]

            start_time = time.time()
            result = subprocess.run(cmd, capture_output=True, text=True, env=process_env)
            execution_time = time.time() - start_time

            # Log execution time
            print(f"[TIMING] Processing took {execution_time:.2f} seconds", flush=True)

            # Detect if GPU was used
            gpu_used = False
            if result.stderr:
                stderr_lower = result.stderr.lower()
                if "nvh264enc" in stderr_lower or "nvenc" in stderr_lower:
                    gpu_used = True
                    print("[GPU] Hardware encoding (NVENC) was used", flush=True)
                elif "x264enc" in stderr_lower or "x264" in stderr_lower:
                    print("[GPU] CPU encoding (x264) was used instead of GPU", flush=True)

            if result.returncode != 0:
                print(
                    f"ERROR: cesdk-processor failed with exit code {result.returncode}",
                    flush=True,
                )
                print(f"ERROR: Process stderr: {result.stderr}", flush=True)
                raise RuntimeError(f"Processing failed with exit code {result.returncode}. Check logs for details.")

            # Check if output file was created
            if not os.path.exists(output_file):
                print(f"ERROR: Output file not created: {output_file}", flush=True)
                raise FileNotFoundError(f"Output file not created: {output_file}")

            # Upload the output file with proper type for preview
            # Detect file type based on extension
            output_ext = os.path.splitext(output_file)[1].lower()

            # Wrap in appropriate type for FAL UI preview
            if output_ext in ['.mp4', '.mov', '.avi', '.webm', '.mkv']:
                # Video output - use Video type for video preview
                video = Video.from_path(output_file)

                # Clean up temp files before returning
                try:
                    os.remove(input_file)
                    os.remove(output_file)
                except Exception:
                    pass

                return VideoOutput(video=video, processing_time_seconds=execution_time, gpu_used=gpu_used)

            elif output_ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']:
                # Image output - use Image type for image preview
                image = Image.from_path(output_file)

                # Clean up temp files before returning
                try:
                    os.remove(input_file)
                    os.remove(output_file)
                except Exception:
                    pass

                return ImageOutput(image=image, processing_time_seconds=execution_time, gpu_used=gpu_used)

            else:
                # Unknown type - use generic File
                file = File.from_path(output_file)

                # Clean up temp files before returning
                try:
                    os.remove(input_file)
                    os.remove(output_file)
                except Exception:
                    pass

                return FileOutput(file=file, processing_time_seconds=execution_time, gpu_used=gpu_used)

        except Exception as e:
            print(f"ERROR: Processing failed: {str(e)}", flush=True)
            print(f"ERROR: Traceback: {traceback.format_exc()}", flush=True)
            raise
