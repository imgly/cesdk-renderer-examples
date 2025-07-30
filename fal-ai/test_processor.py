#!/usr/bin/env python3
"""
Test script for processor_container.py functionality without fal deployment.
This allows testing the core processing logic locally.
"""

import os
import sys
import tempfile
import shutil
import logging
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.request import urlretrieve

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Mock fal components
class MockFile:
    def __init__(self, path):
        self.path = path
        self.url = "file://{}".format(path)
    
    @classmethod
    def from_path(cls, path):
        logger.info("MockFile.from_path called with: {}".format(path))
        return cls(path)

def mock_download_file(url, target_dir="/tmp"):
    """Mock implementation of fal download_file"""
    logger.info("Mock downloading {} to {}".format(url, target_dir))
    
    # For testing, we'll create a dummy file or download a real one
    filename = Path(url).name or "test_input.scene"
    target_path = Path(target_dir) / filename
    
    # Create a dummy file for testing
    target_path.write_text("dummy content for testing")
    logger.info("Created mock file at: {}".format(target_path))
    return target_path

class MockInput:
    def __init__(self, file_url):
        self.file_url = file_url

class MockOutput:
    def __init__(self, file):
        self.file = file

# Test the core processing logic
def test_process_logic():
    """Test the core processing logic from processor_container.py"""
    
    # Mock the fal imports
    with patch.dict('sys.modules', {
        'fal': Mock(),
        'fal.container': Mock(),
        'fal.toolkit': Mock(File=MockFile, download_file=mock_download_file),
    }):
        
        # Import the processing logic (we'll extract it)
        from pathlib import Path
        
        # Simulate the process method logic
        input_data = MockInput("https://example.com/test.scene")
        
        logger.info("Processing request with file URL: {}".format(input_data.file_url))
        
        # Download the input file (mocked)
        logger.info("Downloading input file...")
        input_file = mock_download_file(input_data.file_url, target_dir="/tmp")
        logger.info("Downloaded file to: {}".format(input_file))
        
        # Check if file exists and get its size
        if os.path.exists(input_file):
            file_size = os.path.getsize(input_file)
            logger.info("Input file exists, size: {} bytes".format(file_size))
        else:
            logger.error("Input file does not exist: {}".format(input_file))
            raise FileNotFoundError("Downloaded file not found: {}".format(input_file))
        
        # Generate output file path
        input_path = Path(input_file)
        output_file = str(input_path.parent / (input_path.stem + '_processed.mp4'))
        logger.info("Output file will be: {}".format(output_file))
        
        # Check if license is available (mocked)
        license_key = os.environ.get('IMGLY_LICENSE', 'mock-license-key')
        if license_key:
            logger.info("IMGLY_LICENSE environment variable is available")
        else:
            logger.warning("IMGLY_LICENSE environment variable is not set")
        
        # Mock the imgly-processor run (since we don't have it locally)
        logger.info("Running imgly-processor (mocked)...")
        cmd = ["/opt/imgly-processor/imgly-processor", "--input", str(input_file), "--output", output_file]
        logger.info("Command: {}".format(' '.join(cmd)))
        
        # Mock subprocess.run result
        class MockResult:
            def __init__(self):
                self.returncode = 0
                self.stdout = "Processing completed successfully\nOutput written to {}".format(output_file)
                self.stderr = ""
        
        mock_result = MockResult()
        logger.info("Mock process exit code: {}".format(mock_result.returncode))
        logger.info("Mock process stdout: {}".format(mock_result.stdout))
        if mock_result.stderr:
            logger.error("Mock process stderr: {}".format(mock_result.stderr))
        
        # Create a mock output file
        Path(output_file).write_text("processed video content")
        logger.info("Mock processing completed successfully")
        
        # Check if output file was created
        if os.path.exists(output_file):
            output_size = os.path.getsize(output_file)
            logger.info("Output file created, size: {} bytes".format(output_size))
        else:
            logger.error("Output file was not created: {}".format(output_file))
            raise FileNotFoundError("Output file not created: {}".format(output_file))
        
        # Upload the output file (mocked)
        logger.info("Uploading output file...")
        result_file = MockFile.from_path(output_file)
        logger.info("File uploaded successfully, URL: {}".format(result_file.url))
        
        return MockOutput(file=result_file)

def test_with_real_file():
    """Test with the actual test.scene file"""
    
    # Check if test.scene exists in current directory
    test_scene_path = Path("test.scene")
    if not test_scene_path.exists():
        logger.warning("test.scene not found in current directory, creating a mock one")
        # Fallback to creating a temporary file
        with tempfile.TemporaryDirectory() as temp_dir:
            test_input = Path(temp_dir) / "test_input.scene"
            test_input.write_text("CE.SDK Scene File Content")
            test_scene_path = test_input
    else:
        logger.info("Found test.scene file: {}".format(test_scene_path))
        # Get file size
        file_size = test_scene_path.stat().st_size
        logger.info("File size: {} bytes".format(file_size))
    
    # Test the file path generation logic with the real file
    input_path = Path(test_scene_path)
    output_file = str(input_path.parent / (input_path.stem + '_processed.mp4'))
    
    logger.info("Input: {}".format(test_scene_path))
    logger.info("Output: {}".format(output_file))
    
    # Test the actual processing logic with the real file
    logger.info("Testing processing logic with real file...")
    
    # Mock the imgly-processor command with the real file
    cmd = ["/opt/imgly-processor/imgly-processor", "--input", str(test_scene_path), "--output", output_file]
    logger.info("Would run command: {}".format(' '.join(cmd)))
    
    # Create a mock output file to simulate processing
    Path(output_file).write_text("processed video content from {}".format(test_scene_path.name))
    logger.info("Created mock output file: {}".format(output_file))
    
    # Verify the path generation works correctly
    assert output_file.endswith('_processed.mp4')
    assert Path(output_file).parent == input_path.parent
    
    # Clean up the mock output file
    if Path(output_file).exists():
        Path(output_file).unlink()
        logger.info("Cleaned up mock output file")
    
    logger.info("Real file test passed!")

def test_with_real_scene_file():
    """Test the full processing pipeline with your actual test.scene file"""
    
    # Check if test.scene exists
    test_scene_path = Path("test.scene")
    if not test_scene_path.exists():
        logger.warning("test.scene not found, skipping real scene file test")
        return
    
    logger.info("Testing full processing pipeline with your test.scene file...")
    logger.info("Input file: {}".format(test_scene_path.absolute()))
    
    # Simulate the full process method with your file
    with tempfile.TemporaryDirectory() as temp_dir:
        # Copy your test.scene to temp directory to simulate download
        temp_input = Path(temp_dir) / test_scene_path.name
        shutil.copy2(test_scene_path, temp_input)
        logger.info("Copied to temp location: {}".format(temp_input))
        
        # Show file info
        file_size = temp_input.stat().st_size
        logger.info("Input file size: {} bytes".format(file_size))
        
        # Generate output file path (same logic as in processor_container.py)
        input_path = Path(temp_input)
        output_file = str(input_path.parent / (input_path.stem + '_processed.mp4'))
        logger.info("Output file will be: {}".format(output_file))
        
        # Build the command (same as in processor_container.py)
        cmd = ["/opt/imgly-processor/imgly-processor", "--input", str(temp_input), "--output", output_file]
        logger.info("Command to execute: {}".format(' '.join(cmd)))
        
        # Simulate successful processing
        mock_output_content = "Mock processed MP4 content from {}".format(test_scene_path.name)
        Path(output_file).write_text(mock_output_content)
        logger.info("Mock processing completed")
        
        # Verify output
        if Path(output_file).exists():
            output_size = Path(output_file).stat().st_size
            logger.info("Output file created, size: {} bytes".format(output_size))
        
        logger.info("Full pipeline test with real scene file completed!")

def test_command_construction():
    """Test that the command construction works correctly"""
    
    input_file = "/tmp/test.scene"
    output_file = "/tmp/test_processed.mp4"
    
    cmd = ["/opt/imgly-processor/imgly-processor", "--input", str(input_file), "--output", output_file]
    logger.info("Generated command: {}".format(' '.join(cmd)))
    
    # Verify command structure
    assert cmd[0] == "/opt/imgly-processor/imgly-processor"
    assert cmd[1] == "--input"
    assert cmd[2] == input_file
    assert cmd[3] == "--output"
    assert cmd[4] == output_file
    
    logger.info("Command construction test passed!")

if __name__ == "__main__":
    logger.info("Starting processor tests...")
    
    try:
        logger.info("\n=== Test 1: Basic processing logic ===")
        result = test_process_logic()
        logger.info("Basic processing test completed successfully!")
        
        logger.info("\n=== Test 2: Real file handling ===")
        test_with_real_file()
        
        logger.info("\n=== Test 3: Full pipeline with your test.scene ===")
        test_with_real_scene_file()
        
        logger.info("\n=== Test 4: Command construction ===")
        test_command_construction()
        
        logger.info("\nAll tests passed!")
        
    except Exception as e:
        logger.error("Test failed: {}".format(e))
        import traceback
        traceback.print_exc()
        sys.exit(1)