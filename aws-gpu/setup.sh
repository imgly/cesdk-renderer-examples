#!/usr/bin/env bash
# CE.SDK Renderer — AWS EC2 GPU Instance Setup
#
# Run this script from your local machine. It will:
#   1. Ask for your EC2 instance details and license key
#   2. Upload the project files to the instance
#   3. SSH in and set up GPU, Docker, NVIDIA toolkit
#   4. Build and start the renderer
#
# Recommended EC2 configuration:
#   AMI           : Deep Learning Base AMI with Single CUDA (Ubuntu 22.04)
#   Instance type : g6.2xlarge (NVIDIA L4 24 GB, 8 vCPU, 32 GB RAM)
#   Storage       : 50 GB gp3
#   Region        : Any region with g6 availability (e.g. eu-central-1)
#
# Prerequisites:
#   1. An EC2 quota for "Running On-Demand G and VT instances" >= 8 vCPUs
#      (request via Service Quotas in the AWS console if needed).
#   2. A security group that allows inbound TCP on port 8080 (and 22 for SSH).
#   3. An SSH key pair configured for the instance.
#
# Usage:
#   ./setup.sh
#
# After setup the API is reachable at http://<public-ip>:8080/render
set -euo pipefail

# ---- Remote setup (runs on the EC2 instance) ----
if [ "${CESDK_REMOTE_SETUP:-}" = "1" ]; then
  echo ""
  echo "=== Running setup on EC2 instance ==="

  # ---- Verify GPU ----
  echo ""
  echo "1. Checking NVIDIA GPU..."
  if ! command -v nvidia-smi &>/dev/null; then
    echo "   ERROR: nvidia-smi not found. Use the Deep Learning Base AMI which includes NVIDIA drivers."
    exit 1
  fi
  nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
  echo "   GPU OK"

  # ---- Verify Docker ----
  echo ""
  echo "2. Checking Docker..."
  if ! command -v docker &>/dev/null; then
    echo "   Docker not found, installing..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker.io docker-compose-plugin
    sudo usermod -aG docker "$USER"
    echo "   Docker installed. You may need to log out and back in for group changes."
  else
    docker --version
    echo "   Docker OK"
  fi

  # ---- Verify NVIDIA Container Toolkit ----
  echo ""
  echo "3. Checking NVIDIA Container Toolkit..."
  if ! docker info 2>/dev/null | grep -q "nvidia"; then
    echo "   NVIDIA runtime not found, installing toolkit..."
    # shellcheck disable=1091
    distribution=$(. /etc/os-release; echo "${ID:-}${VERSION_ID:-}")
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update -qq
    sudo apt-get install -y -qq nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    echo "   NVIDIA Container Toolkit installed"
  else
    echo "   NVIDIA runtime OK"
  fi

  # ---- Verify GPU access from Docker ----
  echo ""
  echo "4. Testing GPU access from Docker..."
  if docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &>/dev/null; then
    echo "   GPU accessible from Docker OK"
  else
    echo "   WARNING: Could not access GPU from Docker. Check NVIDIA Container Toolkit setup."
  fi

  # ---- Log in to container registry ----
  echo ""
  echo "5. Logging in to container.img.ly registry..."
  CESDK_LICENSE=$(grep 'CESDK_LICENSE=' .env | head -1 | cut -d= -f2-)
  echo "$CESDK_LICENSE" | docker login container.img.ly -u api --password-stdin
  echo "   Registry login OK"

  # ---- Build and start ----
  echo ""
  echo "6. Building and starting the renderer..."
  docker compose up -d --build

  echo ""
  echo "=== Remote setup complete ==="
  exit 0
fi

# ---- Local setup (runs on your machine) ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== CE.SDK Renderer AWS GPU Setup ==="
echo ""
echo "This script will deploy the CE.SDK Renderer to an AWS EC2 GPU instance."
echo ""
echo "If you haven't created an EC2 instance yet, use these settings:"
echo ""
echo "  AMI           : Deep Learning Base AMI with Single CUDA (Ubuntu 22.04)"
echo "  Instance type : g6.2xlarge (NVIDIA L4 24 GB, 8 vCPU, 32 GB RAM)"
echo "  Storage       : 35 GB gp3 (default)"
echo "  Region        : Any region with g6 availability (e.g. eu-central-1)"
echo ""
echo "  Required quota: 'Running On-Demand G and VT instances' >= 8 vCPUs"
echo "  Security group: Allow inbound TCP on ports 22 (SSH) and 8080 (API)"
echo ""

# ---- Load saved config ----
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ---- Collect inputs (reuse saved values) ----
if [ -n "${EC2_HOST:-}" ]; then
  echo "Using saved EC2 host: ${EC2_HOST}"
  read -rp "Press Enter to keep, or type a new host: " EC2_HOST_INPUT
  EC2_HOST="${EC2_HOST_INPUT:-$EC2_HOST}"
else
  read -rp "EC2 public IP or hostname: " EC2_HOST
fi
if [ -z "$EC2_HOST" ]; then
  echo "ERROR: An EC2 host is required."
  exit 1
fi

if [ -n "${SSH_KEY:-}" ]; then
  echo "Using saved SSH key: ${SSH_KEY}"
  read -rp "Press Enter to keep, or type a new path: " SSH_KEY_INPUT
  SSH_KEY="${SSH_KEY_INPUT:-$SSH_KEY}"
else
  read -rp "SSH key file path (e.g. ~/.ssh/my-key.pem): " SSH_KEY
fi
if [ -z "$SSH_KEY" ]; then
  echo "ERROR: An SSH key file is required."
  exit 1
fi
SSH_KEY="${SSH_KEY/#\~/$HOME}"
if [ ! -f "$SSH_KEY" ]; then
  echo "ERROR: SSH key file not found: $SSH_KEY"
  exit 1
fi

if [ -n "${SSH_USER:-}" ]; then
  echo "Using saved SSH user: ${SSH_USER}"
  read -rp "Press Enter to keep, or type a new user: " SSH_USER_INPUT
  SSH_USER="${SSH_USER_INPUT:-$SSH_USER}"
else
  read -rp "SSH user [ubuntu]: " SSH_USER
  SSH_USER="${SSH_USER:-ubuntu}"
fi

if [ -n "${CESDK_LICENSE:-}" ]; then
  echo "Using saved license"
else
  read -rp "CE.SDK license key: " CESDK_LICENSE
  if [ -z "$CESDK_LICENSE" ]; then
    echo "ERROR: A license key is required. Get one at https://img.ly"
    exit 1
  fi
fi

# ---- Save config for next run ----
cat > "$ENV_FILE" <<EOF
EC2_HOST=${EC2_HOST}
SSH_KEY=${SSH_KEY}
SSH_USER=${SSH_USER}
CESDK_LICENSE=${CESDK_LICENSE}
EOF
echo "Config saved to .env"

REMOTE_DIR="cesdk-renderer"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

echo ""
echo "=== Deploying to ${SSH_USER}@${EC2_HOST} ==="

# ---- Upload project files ----
echo ""
echo "Uploading project files..."
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${EC2_HOST}" "mkdir -p ~/${REMOTE_DIR}"
scp "${SSH_OPTS[@]}" -r \
  "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}/docker-compose.yml" \
  "${SCRIPT_DIR}/package.json" \
  "${SCRIPT_DIR}/src" \
  "${SCRIPT_DIR}/setup.sh" \
  "${SCRIPT_DIR}/.dockerignore" \
  "${SSH_USER}@${EC2_HOST}:~/${REMOTE_DIR}/"
echo "   Upload OK"

# ---- Create .env on the instance ----
echo ""
echo "Writing license to remote .env..."
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${EC2_HOST}" "echo 'CESDK_LICENSE=${CESDK_LICENSE}' > ~/${REMOTE_DIR}/.env"
echo "   License OK"

# ---- Run remote setup ----
echo ""
echo "Running remote setup via SSH..."
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" -t "${SSH_USER}@${EC2_HOST}" "cd ~/${REMOTE_DIR} && CESDK_REMOTE_SETUP=1 bash setup.sh"

echo ""
echo "=== Setup complete ==="
echo ""
echo "The API is running at http://${EC2_HOST}:8080"
echo ""
echo "  Health check:"
echo "    curl http://${EC2_HOST}:8080/health"
echo ""
echo "  Render a demo scene:"
echo "    curl -X POST http://${EC2_HOST}:8080/render \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"file_url\": \"https://cdn.img.ly/assets/demo/v2/ly.img.video.template/templates/milli-surf-school.scene\"}' \\"
echo "      --output rendered.mp4"
