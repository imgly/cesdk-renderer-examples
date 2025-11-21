#!/usr/bin/env node

/**
 * CE.SDK Renderer - Host-based Demo
 *
 * This script demonstrates the host-based approach where Node.js runs
 * on the host machine and spawns ephemeral Docker containers to process
 * each variation. Best for development and integration with existing
 * Node.js applications.
 */

import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

import CreativeEngine from '@cesdk/node';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const INPUT_ARCHIVE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'demo.zip');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const DOCKER_IMAGE = 'imgly/cesdk-renderer:1.61.0-nightly.20250925';

// Text variable variations
const variations = [
  { name: 'new_york', variables: { bottom_text: 'Work from New York' } },
  {
    name: 'san_francisco',
    variables: { bottom_text: 'Work from San Francisco' }
  },
  { name: 'london', variables: { bottom_text: 'Work from London' } },
  { name: 'tokyo', variables: { bottom_text: 'Work from Tokyo' } },
  { name: 'berlin', variables: { bottom_text: 'Work from Berlin' } }
];

async function processWithDocker(sceneData, outputName) {
  const tempDir = path.join(__dirname, '.temp');
  await fs.promises.mkdir(tempDir, { recursive: true });
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  // Ensure write permissions on output directory
  await fs.promises.chmod(OUTPUT_DIR, 0o777);

  const tempScenePath = path.join(tempDir, `${outputName}.zip`);
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.mp4`);

  // Write modified scene to temp file
  await fs.promises.writeFile(tempScenePath, sceneData);

  console.log(`Processing ${outputName}...`);

  // Spawn Docker container to process the scene
  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    `${tempDir}:/input:ro`,
    '-v',
    `${OUTPUT_DIR}:/output:rw`,
    '-e',
    `CESDK_LICENSE=${process.env.CESDK_LICENSE}`,
    '-e',
    'UBQ_AV_OVERRIDE_H264_ENCODER=nvh264enc',
    '-e',
    'UBQ_AV_OVERRIDE_H265_ENCODER=nvh265enc',
    '-e',
    'VERBOSE=1',
    '--gpus',
    'all',
    DOCKER_IMAGE,
    `--input=/input/${outputName}.zip`,
    `--output=/output/${outputName}.mp4`
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn('docker', dockerArgs);

    // Collect output for logging only on failure
    let stdoutOutput = '';
    let stderrOutput = '';

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });
    }

    proc.on('exit', (code) => {
      if (code === 0) {
        console.log(`✓ ${outputName}.mp4 created`);
        resolve();
      } else {
        console.error(`✗ Failed to process ${outputName} (exit code ${code})`);
        if (stderrOutput || stdoutOutput) {
          console.error(`Output:`);
          if (stdoutOutput) console.error(`stdout: ${stdoutOutput.slice(0, 500)}`);
          if (stderrOutput) console.error(`stderr: ${stderrOutput.slice(0, 500)}`);
        }
        reject(new Error(`Docker exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });

  // Clean up temp file
  await fs.promises.unlink(tempScenePath);
  return outputPath;
}

async function main() {
  // Initialize CE.SDK engine
  const engine = await CreativeEngine.init({
    license: process.env.CESDK_LICENSE
  });

  const archiveUrl = `file://${INPUT_ARCHIVE}`;
  await engine.addDefaultAssetSources();

  // Process each variation
  for (const variation of variations) {
    // Load and modify the scene
    await engine.scene.loadFromArchiveURL(archiveUrl);

    for (const [key, value] of Object.entries(variation.variables)) {
      const blocks = engine.block.findByName(key);
      if (blocks && blocks.length > 0) {
        engine.block.setString(blocks[0], 'text/text', value);
      }
    }

    // Save modified scene
    const modifiedSceneBlob = await engine.scene.saveToArchive();
    const modifiedSceneBuffer = Buffer.from(
      await modifiedSceneBlob.arrayBuffer()
    );

    // Process with Docker container
    await processWithDocker(modifiedSceneBuffer, variation.name);
  }

  engine.dispose();

  // Clean up temp directory
  await fs.promises.rm(path.join(__dirname, '.temp'), {
    recursive: true,
    force: true
  });

  console.log(`\n✓ All variations created in ${OUTPUT_DIR}/`);
}

main().catch(console.error);
