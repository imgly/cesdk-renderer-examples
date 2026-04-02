#!/bin/bash

# CE.SDK Renderer GPU Requirements Checker
# This script verifies all prerequisites for running CE.SDK Renderer with GPU acceleration

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "=== CE.SDK Renderer GPU Requirements Checklist ==="
echo "Checking system configuration for:"
echo "- NVIDIA Video Encoding (NVENC)"
echo "- EGL Context Support"
echo "- Docker GPU Runtime"
echo

# Track overall status
ALL_GOOD=true

# Function to check requirement
check_requirement() {
    local test_name=$1
    local test_result=$2
    local required=$3

    if [ "$test_result" = "true" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
    else
        echo -e "${RED}✗${NC} $test_name"
        if [ "$required" = "true" ]; then
            ALL_GOOD=false
        fi
    fi
}

echo
echo "=== 1. NVIDIA Driver & GPU Detection ==="

# Check NVIDIA driver
if nvidia-smi &>/dev/null; then
    DRIVER_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    check_requirement "NVIDIA driver installed (version: $DRIVER_VERSION)" "true" "true"
    check_requirement "GPU detected: $GPU_NAME" "true" "true"
else
    check_requirement "NVIDIA driver installed" "false" "true"
    check_requirement "GPU detected" "false" "true"
fi

echo
echo "=== 2. NVIDIA Video Codec (NVENC) Support ==="

# Check for NVENC support with timeout
NVENC_SUPPORT="false"

# First try to check GPU information files
for gpu_info in /proc/driver/nvidia/gpus/*/information; do
    if [ -f "$gpu_info" ]; then
        if timeout 2s grep -q "Video Encoder" "$gpu_info" 2>/dev/null; then
            NVENC_SUPPORT="true"
            break
        fi
    fi
done

# Alternative check using nvidia-smi with timeout
if [ "$NVENC_SUPPORT" = "false" ] && command -v nvidia-smi &>/dev/null; then
    # Note: encodersessions might not be available on all drivers
    if timeout 2s nvidia-smi --query-gpu=encoder.stats.sessionCount --format=csv,noheader 2>/dev/null | grep -q "[0-9]"; then
        NVENC_SUPPORT="true"
    fi
fi

check_requirement "NVENC hardware encoder available" "$NVENC_SUPPORT" "true"

# Check NVENC libraries with timeout
NVENC_LIBS="false"
if timeout 2s ldconfig -p 2>/dev/null | grep -q "libnvidia-encode.so"; then
    NVENC_LIBS="true"
fi
check_requirement "NVENC libraries installed (libnvidia-encode.so)" "$NVENC_LIBS" "true"

echo
echo "=== 3. EGL Context Support ==="

# Check EGL libraries with timeout
EGL_NVIDIA="false"
if timeout 5s find /usr -name "libEGL_nvidia.so*" 2>/dev/null | grep -q .; then
    EGL_NVIDIA="true"
fi
check_requirement "NVIDIA EGL libraries (libEGL_nvidia.so)" "$EGL_NVIDIA" "true"

# Check EGL vendor config
EGL_VENDOR="false"
if [ -f /usr/share/glvnd/egl_vendor.d/10_nvidia.json ]; then
    EGL_VENDOR="true"
fi
check_requirement "NVIDIA EGL vendor configuration" "$EGL_VENDOR" "true"

# Check Mesa EGL with timeout
MESA_EGL="false"
if timeout 2s ldconfig -p 2>/dev/null | grep -q "libEGL.so"; then
    MESA_EGL="true"
fi
check_requirement "Mesa EGL libraries (libEGL.so)" "$MESA_EGL" "true"

# Check for display capabilities (optional for headless GPUs)
DISPLAY_CAP="false"
for gpu_info_file in /proc/driver/nvidia/gpus/*/information; do
    if [ -f "$gpu_info_file" ]; then
        if grep -q "Display" "$gpu_info_file" 2>/dev/null; then
            DISPLAY_CAP="true"
            break
        fi
    fi
done
check_requirement "GPU display capabilities (optional)" "$DISPLAY_CAP" "false"

echo
echo "=== 4. Required System Libraries ==="

# Check OpenGL libraries with timeout (optional - CE.SDK Renderer includes its own)
GL_LIBS="false"
if timeout 2s ldconfig -p 2>/dev/null | grep -q "libGL.so" && timeout 2s ldconfig -p 2>/dev/null | grep -q "libGLESv2.so"; then
    GL_LIBS="true"
fi
check_requirement "OpenGL/GLES libraries (optional - included in container)" "$GL_LIBS" "false"

# Check VDPAU (video decoding)
VDPAU="false"
if dpkg -l | grep -q "vdpau-driver-all"; then
    VDPAU="true"
fi
check_requirement "VDPAU video decoding drivers" "$VDPAU" "false"

echo
echo "=== 5. Docker GPU Runtime ==="

# Check Docker
DOCKER="false"
if command -v docker &>/dev/null; then
    DOCKER="true"
fi
check_requirement "Docker installed" "$DOCKER" "true"

# Check NVIDIA Container Runtime
NVIDIA_RUNTIME="false"
if docker info 2>/dev/null | grep -q nvidia; then
    NVIDIA_RUNTIME="true"
fi
check_requirement "NVIDIA Container Runtime configured" "$NVIDIA_RUNTIME" "true"

# Test GPU access in container with timeout
CONTAINER_GPU="false"
if [ "$DOCKER" = "true" ] && [ "$NVIDIA_RUNTIME" = "true" ]; then
    if timeout 10s docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.9.1-base-ubuntu24.04 nvidia-smi &>/dev/null; then
        CONTAINER_GPU="true"
    fi
fi
check_requirement "Container GPU access test" "$CONTAINER_GPU" "true"

echo
echo "=== 6. CE.SDK Renderer Specific Tests ==="

# Test EGL in container - this may fail even when CE.SDK Renderer works
EGL_CONTAINER="false"
if [ "$DOCKER" = "true" ] && [ "$NVIDIA_RUNTIME" = "true" ]; then
    # Skip this test if explicitly requested
    if [ "$1" != "--skip-container-test" ]; then
        if timeout 10s docker run --rm --runtime=nvidia --gpus 'all,"capabilities=compute,graphics,utility,video,display"' \
            nvidia/cuda:12.9.1-base-ubuntu24.04 bash -c 'apt-get update -qq && apt-get install -y -qq mesa-utils &>/dev/null && eglinfo &>/dev/null' 2>/dev/null; then
            EGL_CONTAINER="true"
        fi
    else
        EGL_CONTAINER="skipped"
    fi
fi
if [ "$EGL_CONTAINER" = "skipped" ]; then
    echo "⚠ EGL context creation in container (skipped)"
else
    check_requirement "EGL context creation in container (optional)" "$EGL_CONTAINER" "false"
fi

echo
echo "=== Summary ==="
echo

if [ "$ALL_GOOD" = "true" ]; then
    echo -e "${GREEN}✓ All critical components are installed!${NC}"
    echo
else
    echo -e "${RED}✗ Missing required components!${NC}"
    echo
    echo "To fix the issues:"
    echo
    if [ "$EGL_NVIDIA" = "false" ] || [ "$EGL_VENDOR" = "false" ] || [ "$NVENC_LIBS" = "false" ]; then
        echo "1. Install full NVIDIA display drivers (not just CUDA):"
        echo "   sudo apt-get update"
        echo "   sudo apt-get install -y nvidia-driver-570"
        echo "   sudo reboot # Reboot to apply changes"
        echo
    fi
    if [ "$MESA_EGL" = "false" ] || [ "$GL_LIBS" = "false" ]; then
        echo "2. Install Mesa/EGL libraries:"
        echo "   sudo apt-get install -y libegl1-mesa libgl1-mesa-glx libgles2-mesa mesa-utils"
        echo
    fi
    if [ "$NVIDIA_RUNTIME" = "false" ]; then
        echo "3. Configure NVIDIA Container Runtime:"
        echo "   sudo nvidia-ctk runtime configure --runtime=docker"
        echo "   sudo systemctl restart docker"
        echo
    fi
fi

# Optional: Show detailed library paths
if [ "$1" = "--verbose" ]; then
    echo
    echo "=== Verbose Library Information ==="
    echo "NVIDIA libraries:"
    timeout 5s find /usr -name "libnvidia-*.so*" -type f 2>/dev/null | grep -E "(encode|egl|gl)" | head -10
    echo
    echo "EGL configuration:"
    cat /usr/share/glvnd/egl_vendor.d/10_nvidia.json 2>/dev/null || echo "No NVIDIA EGL config found"
fi
