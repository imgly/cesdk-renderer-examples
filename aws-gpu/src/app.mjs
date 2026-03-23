import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);
const app = express();
const port = 8080;

app.use(express.json());

async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(buffer));
  return destPath;
}

app.post('/render', async (req, res) => {
  const {
    file_url,
    debug = false,
    render_device = 'auto',
    output_mime_type = 'video/mp4',
    video_render_options,
    audio_render_options,
    text_replacements = {}
  } = req.body;

  if (!file_url) {
    return res.status(400).json({ error: 'file_url is required' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const outputExt = output_mime_type === 'video/mp4' ? '.mp4' : '.png';
  const inputPath = `/tmp/input-${jobId}.scene`;
  const outputPath = `/tmp/output-${jobId}${outputExt}`;

  try {
    console.log(`[${jobId}] Downloading: ${file_url}`);
    await downloadFile(file_url, inputPath);

    console.log(`[${jobId}] Rendering with options:`, {
      mime: output_mime_type,
      debug,
      render_device,
      video_options: video_render_options,
      audio_options: audio_render_options,
      text_replacements
    });

    const startTime = Date.now();

    const args = [
      '--input', inputPath,
      '--output', outputPath,
      '--output-mime-type', output_mime_type,
      '--json-progress',
      '--render-device', render_device
    ];

    if (debug) {
      args.push('--verbose');
    }

    if (video_render_options) {
      args.push('--video-options', JSON.stringify(video_render_options));
    }

    if (audio_render_options) {
      args.push('--audio-options', JSON.stringify(audio_render_options));
    }

    for (const [key, value] of Object.entries(text_replacements)) {
      args.push('--text', `${key}=${value}`);
    }

    console.log(`[${jobId}] Command: /opt/cesdk-renderer/cesdk-renderer ${args.join(' ')}`);

    const { stdout, stderr } = await execFileAsync(
      '/opt/cesdk-renderer/cesdk-renderer',
      args,
      { cwd: '/opt/cesdk-renderer', maxBuffer: 50 * 1024 * 1024 }
    );

    const processingTime = (Date.now() - startTime) / 1000;

    if (debug) {
      console.log(`[${jobId}] === STDOUT ===`);
      console.log(stdout);
      console.log(`[${jobId}] === STDERR ===`);
      console.log(stderr);
    }

    let finalOutputPath = outputPath;
    for (const line of stdout.split('\n')) {
      if (line.trim().startsWith('{')) {
        try {
          const json = JSON.parse(line);
          if (json.status === 'done' && json.path) {
            finalOutputPath = json.path;
          }
        } catch (e) { /* ignore non-JSON lines */ }
      }
    }

    console.log(`[${jobId}] Done in ${processingTime}s: ${finalOutputPath}`);

    res.setHeader('Content-Type', output_mime_type);
    res.setHeader('X-Processing-Time', processingTime);
    res.setHeader('X-Render-Device', render_device);

    const fileBuffer = await fs.readFile(finalOutputPath);
    res.send(fileBuffer);

    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(finalOutputPath).catch(() => {});

  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    res.status(500).json({ error: error.message, jobId });
    await fs.unlink(inputPath).catch(() => {});
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`CE.SDK Renderer API listening on port ${port}`);
});
