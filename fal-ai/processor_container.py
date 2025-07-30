import subprocess
import fal
import os
import time
import sys

from fal.container import ContainerImage
from pydantic import BaseModel
from fal.toolkit import File, download_file

custom_image = ContainerImage.from_dockerfile_str(
    """
    FROM imgly/imgly-processor:1.57.0-nightly.20250722

    # Switch to root to install packages
    USER root

    # Add deadsnakes PPA and install Python 3.11 alongside existing Python
    RUN apt-get install -y software-properties-common && \
        add-apt-repository -y ppa:deadsnakes/ppa && \
        apt-get install -y python3.11 python3.11-venv python3.11-dev python3.11-distutils && \
        ln -sf /usr/bin/python3.11 /usr/bin/python && \
        python3.11 --version

    # Switch back to the original user if needed
    # USER <original-user>
    """
)

class Input(BaseModel):
    file_url: str

class Output(BaseModel):
    file: File

class Processor(fal.App, image=custom_image, kind="container"):
    machine_type = "GPU-A100"

    def setup(self):
        # Run SMI just for the fun of it
        import subprocess
        subprocess.run(["nvidia-smi"])

    @fal.endpoint("/")
    def process(self, input: Input) -> Output:
        # Download the input file
        input_file = download_file(input.file_url, target_dir="/tmp")
        
        # Check if file exists and get its size
        if os.path.exists(input_file):
            file_size = os.path.getsize(input_file)
        else:
            raise FileNotFoundError(f"Downloaded file not found: {input_file}")
        
        # Generate output file path
        from pathlib import Path
        input_path = Path(input_file)
        output_file = str(input_path.parent / (input_path.stem + '_processed.mp4'))
        
        # Get the license from fal secret and set it for the subprocess
        license_key = os.environ.get('IMGLY_PROCESSOR_LICENSE')
        if license_key:
            # Set it as IMGLY_LICENSE for the imgly-processor
            os.environ['IMGLY_LICENSE'] = license_key
        
        # Set additional environment variables for the subprocess
        # Force OSS codecs since commercial codec licensing is not set up in production yet
        os.environ['UBQ_AV_CODECS'] = 'oss'
        # Force nvenc usage
        os.environ['UBQ_AV_OVERRIDE_H264_ENCODER'] = 'nvh264enc'
        
        # Run the imgly-processor
        cmd = ["/opt/imgly-processor/imgly-processor", "--input", str(input_file), "--output", output_file]
        
        start_time = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True, env=os.environ.copy())
        end_time = time.time()
        execution_time = end_time - start_time
        
        sys.stderr.write(f"[TIMING] imgly-processor execution time: {execution_time:.2f} seconds\n")
        sys.stderr.flush()
        
        if result.returncode != 0:
            sys.stderr.write(f"Process stdout: {result.stdout}\n")
            sys.stderr.write(f"Process stderr: {result.stderr}\n")
            sys.stderr.flush()
            raise RuntimeError(f"imgly-processor failed with exit code {result.returncode}")
        
        # Check if output file was created
        if os.path.exists(output_file):
            output_size = os.path.getsize(output_file)
        else:
            raise FileNotFoundError(f"Output file not created: {output_file}")
        
        # Upload the output file
        result_file = File.from_path(output_file)
        
        return Output(file=result_file)
    
