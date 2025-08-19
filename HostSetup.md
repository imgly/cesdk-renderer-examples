# Setting up a bare metal GPU compute host for running IMG.LY Processor in Docker containers

This how-to guide will guide you through manually setting up an Ubuntu server to run the IMG.LY Processor containers in the optimal hardware configuration with GPU acceleration.
For production deployments, we recommend automating these steps for host deployment by creating a reusable disk image, Ansible playbook or similar to ensure all the deployed hosts follow the same configuration.

For this example, we'll use a Google Cloud g2-standard-4 instance with a single NVIDIA L4 GPU, running Ubuntu 24.04 LTS.

## Installing the NVIDIA Container Toolkit
This closely follows the official [NVIDIA guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) for installing the Container Toolkit.

1. Install docker if not already set up
```bash
sudo apt-get update -y \
&& sudo apt-get install -y ca-certificates curl \
&& sudo install -m 0755 -d /etc/apt/keyrings \
&& sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
&& sudo chmod a+r /etc/apt/keyrings/docker.asc \
&& echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null \
&& sudo apt-get update -y \
&& sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

1. Install video decoding drivers on the host
```bash
sudo apt-get install -y vdpau-driver-all libvdpau-va-gl1
```

2. Configure the package repositories
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list \
  && sudo apt-get update -y \
  && export NVIDIA_CONTAINER_TOOLKIT_VERSION=1.17.8-1 \
  && sudo apt-get install -y \
    nvidia-container-toolkit=${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
    nvidia-container-toolkit-base=${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
    libnvidia-container-tools=${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
    libnvidia-container1=${NVIDIA_CONTAINER_TOOLKIT_VERSION}
```

3. Configure the Docker daemon
```bash
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
```

4. Test if the GPU runtime was properly configured and can see the GPU hardware
```bash
docker run --rm --runtime=nvidia --gpus all ubuntu nvidia-smi
```
It should produce output similar to this example:
```
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 570.133.07             Driver Version: 570.133.07     CUDA Version: 12.8     |
|-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |
|                                         |                        |               MIG M. |
|=========================================+========================+======================|
|   0  NVIDIA L4                      Off |   00000000:00:04.0 Off |                    0 |
| N/A   40C    P8             12W /   72W |       0MiB /  23034MiB |      0%      Default |
|                                         |                        |                  N/A |
+-----------------------------------------+------------------------+----------------------+

+-----------------------------------------------------------------------------------------+
| Processes:                                                                              |
|  GPU   GI   CI              PID   Type   Process name                        GPU Memory |
|        ID   ID                                                               Usage      |
|=========================================================================================|
|  No running processes found                                                             |
+-----------------------------------------------------------------------------------------+
```
