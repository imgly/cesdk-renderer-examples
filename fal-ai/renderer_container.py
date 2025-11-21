import fal, fal.logging
import json
import os
import subprocess
import sys
import time
import traceback

from fal.container import ContainerImage
from pydantic import BaseModel
from fal.toolkit import File, Image, Video, download_file
from typing import Union


# Define a custom container image for the cesdk-renderer
# This image is based on the nightly version of cesdk-renderer
# and includes Python 3.13 installed via the deadsnakes PPA.
custom_image = ContainerImage.from_dockerfile_str(
    """
    FROM imgly/cesdk-renderer:1.64.0-preview

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

logger = fal.logging.get_logger()

class Input(BaseModel):
    file_url: str
    verbose_output: bool = False

class ImageOutput(BaseModel):
    image: Image
    processing_time_seconds: float

class VideoOutput(BaseModel):
    video: Video
    processing_time_seconds: float

class FileOutput(BaseModel):
    file: File
    processing_time_seconds: float

class Renderer(fal.App, image=custom_image, kind="container"):
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
                logger.error(f"Downloaded file not found: {input_file}")
                raise FileNotFoundError(f"Downloaded file not found: {input_file}")

            # Generate output file path
            from pathlib import Path
            input_path = Path(input_file)

            # Set additional environment variables for the subprocess
            # Create a clean environment copy
            process_env = os.environ.copy()

            # Get the license from fal secret and set it for the subprocess
            license_key = os.environ.get("CESDK_LICENSE")
            if not license_key:
                logger.warning(
                    "CESDK_LICENSE not found in environment - renderer may fail. Please set it in Fal secrets."
                )

            # Ensure library paths are set correctly for production
            lib_paths = [
                "/usr/local/cuda/lib64",
                "/usr/local/cuda-12/lib64",
                "/usr/lib/x86_64-linux-gnu",
                "/usr/local/lib",
            ]
            existing_ld_path = process_env.get('LD_LIBRARY_PATH', '')
            process_env['LD_LIBRARY_PATH'] = ':'.join(lib_paths) + (':' + existing_ld_path if existing_ld_path else '')

            # Add CUDA-specific paths for NVENC
            process_env['CUDA_HOME'] = '/usr/local/cuda'
            process_env['CUDA_PATH'] = '/usr/local/cuda'

            # Minimal debug logging
            process_env["GST_DEBUG"] = "*:1"

            # Run the cesdk-renderer
            renderer_path = "/opt/cesdk-renderer/cesdk-renderer"
            cmd = [renderer_path, "--input", str(input_file), "--json-progress"]
            if input.verbose_output:
                cmd.append("--verbose")

            start_time = time.time()
            result = subprocess.run(cmd, capture_output=True, text=True, env=process_env)
            execution_time = time.time() - start_time

            # Log execution time
            logger.info(f"[TIMING] Processing took {execution_time:.2f} seconds")

            if result.returncode != 0:
                logger.error(
                    f"ERROR: cesdk-renderer failed with exit code {result.returncode}",
                )
                logger.error(f"ERROR: Process stdout: {result.stdout}")
                logger.error(f"ERROR: Process stderr: {result.stderr}")
                raise RuntimeError(f"Processing failed with exit code {result.returncode}. Check logs for details.")

            if input.verbose_output:
                logger.info(f"Process stdout: {result.stdout}")
                logger.info(f"Process stderr: {result.stderr}")

            output_file = ""
            for log_line in result.stdout.splitlines():
                log_line = log_line.strip()
                if not log_line.startswith("{") and log_line.endswith("}"):
                    continue
                log_json = dict()
                try:
                    log_json = json.loads(log_line)
                except json.decoder.JSONDecodeError:
                    continue
                if log_json.get("status") == "done":
                    output_file = log_json.get("path")

            # Check if output file was created
            if len(output_file) == 0 or not os.path.exists(output_file):
                logger.error(f"Output file not created: {output_file}")
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

                return VideoOutput(video=video, processing_time_seconds=execution_time)

            elif output_ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']:
                # Image output - use Image type for image preview
                image = Image.from_path(output_file)

                # Clean up temp files before returning
                try:
                    os.remove(input_file)
                    os.remove(output_file)
                except Exception:
                    pass

                return ImageOutput(image=image, processing_time_seconds=execution_time)

            else:
                # Unknown type - use generic File
                file = File.from_path(output_file)

                # Clean up temp files before returning
                try:
                    os.remove(input_file)
                    os.remove(output_file)
                except Exception:
                    pass

                return FileOutput(file=file, processing_time_seconds=execution_time)

        except Exception as e:
            logger.error(f"Processing failed: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise
