# CE.SDK Renderer - Early Access Demo

Experience the power of hardware-accelerated creative automation with the CE.SDK Renderer - a native, GPU-optimized service for server-side video editing, large-scale rendering, and batch content automation.

## What is CE.SDK Renderer?

The CE.SDK Renderer completes our server platform support by providing a hardware-accelerated tool that can export scenes and archives to MP4 and static formats. It's designed for enterprises and developers who need:

- **High-Performance Batch Processing** - Generate thousands of variations at unprecedented speed
- **Programmatic Video Editing** - Automate video content creation and manipulation
- **Template-Based Automation** - Create personalized content at scale
- **100% Patent-Safe Solution** - We handle all codec licensing and patent fees

## Key Benefits

### Lightning Fast Performance

- **5-10x faster** than traditional Node.js solutions
- **GPU-accelerated** rendering pipeline
- **Native performance** for demanding workloads

### Enterprise-Ready Video Processing

- **Full video support** including H.264/H.265 import & H.264 export (WebM coming soon)
- **Hardware acceleration** with NVIDIA GPUs
- **Batch processing** thousands of variations efficiently

### Complete Creative Automation

- **Programmatic control** over every aspect of your designs
- **Variable substitution** for personalized content
- **Seamless integration** with existing workflows
- **Self-hosted solution** - full control within your infrastructure

## Use Cases

This demo showcases a simple but powerful use case: generating location-based variations of a design. In production, CE.SDK Renderer enables:

- **Marketing Automation** - Generate thousands of personalized ads, social media posts, or email graphics
- **Print-on-Demand** - Create customized postcards, business cards, or promotional materials
- **Video Content Automation** - Programmatically edit, cut, and personalize video content
- **Dynamic Asset Management** - Adjust creative assets for different brands or regions on-the-fly
- **Real-Time Personalization** - Generate custom content based on user data or preferences

## Quick Start

### Get Your Trial License

Start your free trial at [img.ly/forms/free-trial](https://img.ly/forms/free-trial) and use the provided API key as your license.

### Prerequisites

- Docker
- NVIDIA GPU with Docker GPU support
- CE.SDK trial or production license
- Node.js 20+ (for host-based approach only)

> **Note:** This demo is configured to work with the included `demo.zip` file, which contains text blocks with specific variable names (`bottom_text`). To use your own CE.SDK archive, you'll need to modify the `variations` array in the processing scripts to match your scene's variable names.

### Option 1: Host-Based Approach (Development)

Run Node.js locally and spawn Docker containers for each variation:

1. **Install dependencies:**

```bash
npm install
```

2. **Pull the Docker image:**

```bash
docker pull imgly/cesdk-renderer:1.61.0-nightly.20250925
```

3. **Set your license key:**

```bash
export IMGLY_LICENSE="your-api-key-from-trial"
```

4. **Run the demo:**

```bash
node process-docker.js demo.zip
```

### Option 2: Container-Based Approach (Production)

Everything runs inside a single Docker container for better performance:

1. **Build the container:**

```bash
docker build -t cesdk-renderer-demo .
```

2. **Set your license key:**

```bash
export IMGLY_LICENSE="your-api-key-from-trial"
```

3. **Run the container:**

```bash
docker run --rm \
  --gpus all \
  -v "$(pwd)/outputs:/app/outputs" \
  -e IMGLY_LICENSE="${IMGLY_LICENSE}" \
  cesdk-renderer-demo demo.zip
```

## How This Demo Works

The demo performs a two-step process:

1. **Scene Modification** - Loads an existing `demo.zip` using the Node.js package and modifies it based on variation definitions
2. **Processing** - Saves modified archives and sends them to the CE.SDK Renderer for exporting

### Working with Variations

The included `demo.zip` contains a CE.SDK scene with a text block named `bottom_text` that gets replaced with different messages. The demo uses `engine.block.findByName('bottom_text')` to locate and update this specific block.

```javascript
// The demo looks for a block named 'bottom_text' in your scene
const variations = [
  { name: 'custom', variables: { bottom_text: 'Your Message' } }
  // Scale to thousands of variations...
];
```

This logic can be freely adapted. The Node.js package ships our full API interface for scene modification and you can implement whatever variation logic you need.

### Sample Output

The demo generates personalized videos for different markets:

- `new_york.mp4` - "Work from New York"
- `san_francisco.mp4` - "Work from San Francisco"
- `london.mp4` - "Work from London"
- `tokyo.mp4` - "Work from Tokyo"
- `berlin.mp4` - "Work from Berlin"

## Demo Notes

This early access demo uses:

- **Public Docker image** from DockerHub with open-source codecs for evaluation
- **NVIDIA GPU requirement** for the demo (production version supports CPU fallback)
- **Pre-release software** - performance improvements ongoing
- **Trial license required** - get yours at [img.ly/forms/free-trial](https://img.ly/forms/free-trial)

The production version will include our proprietary, patent-safe codec pipeline with superior performance and full legal compliance.

## 🛠️ Two Deployment Approaches

### Host-Based Approach (Development)

Perfect for integrating CE.SDK Renderer into existing Node.js applications:

- Node.js orchestrates the workflow
- Docker containers handle rendering
- Easy debugging and development

### Container-Based Approach (Production)

Optimized for production deployments and CI/CD pipelines:

- Single container deployment
- Better performance characteristics
- Simplified infrastructure management

## Technical Architecture

### GPU Acceleration

- NVIDIA hardware acceleration for maximum performance
- Supports full range of NVIDIA GPUs ([see compatibility matrix](https://developer.nvidia.com/video-encode-decode-support-matrix))
- Automatic device selection for optimal performance

### Production Deployment Options

- **Microservices**: Deploy as API endpoints within your infrastructure
- **Serverless**: Scale dynamically with cloud platforms
- **On-Premise**: Full control over data and processing
- **Hybrid**: Combine cloud and on-premise for optimal cost/performance

## Project Structure

```
early_access_demo/
├── process-docker.js   # Host-based orchestration
├── process.js          # Container-based processing
├── Dockerfile          # Production-ready container
├── demo.zip            # Sample CE.SDK scene
├── package.json        # Node.js dependencies
└── outputs/            # Generated variations
```

## Getting Started with Production

Ready to move beyond the demo? The production CE.SDK Renderer offers:

- **Patent-safe codec pipeline** with full legal compliance
- **Optimized performance** beyond the evaluation version
- **Enterprise support** and SLAs
- **Custom deployment options** tailored to your needs

Contact IMG.LY for production licensing and deployment options.

## Support & Contact

- **Documentation**: [docs.img.ly](https://docs.img.ly)
- **Trial Sign-up**: [img.ly/forms/free-trial](https://img.ly/forms/free-trial)
- **Enterprise Inquiries**: Contact IMG.LY support
