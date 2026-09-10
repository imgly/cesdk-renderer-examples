FROM imgly/cesdk-renderer:1.61.0-nightly.20251010

# Switch to root to install Node.js
USER root


# Install Node.js 20
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Ensure containeruser exists (it should from base image, but let's be safe)
RUN id containeruser || useradd -m -u 1001 containeruser

# Create app directory with proper permissions
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the process script and demo archive
COPY process.js ./
COPY demo.zip ./

# Create outputs and temp directories with full permissions
# Set ownership to containeruser but keep 777 permissions for flexibility
RUN mkdir -p /app/outputs /app/.temp && \
    chown -R containeruser:containeruser /app && \
    chmod -R 777 /app

# Set environment variables for NVIDIA hardware acceleration
# CRITICAL: Must include "graphics" and "display" capabilities like the base image!
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,graphics,utility,video,display

# Try to preserve the original working directory for cesdk-renderer
ENV CESDK_WORKDIR=/opt/cesdk-renderer

# Preserve the LD_LIBRARY_PATH from base image
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH}

# Switch back to the original user (containeruser) from the base image
# CRITICAL: The base image uses "containeruser" not UID 1000!
USER containeruser

# Override entrypoint to run our Node.js script
ENTRYPOINT ["node", "process.js"]
