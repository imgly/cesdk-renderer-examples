#!/usr/bin/env node

// Ensure crypto is globally available for CE.SDK
// Some Node.js environments don't expose crypto globally by default
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

import CreativeEngine from '@cesdk/node';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

// Configuration
const INPUT_ARCHIVE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'demo.zip');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const LICENSE = process.env.IMGLY_LICENSE;

// Text variable variations - 5 different location-based sentences
const variations = [
  {
    name: 'new_york',
    variables: {
      bottom_text: 'Work from New York'
    }
  },
  {
    name: 'san_francisco',
    variables: {
      bottom_text: 'Work from San Francisco'
    }
  },
  {
    name: 'london',
    variables: {
      bottom_text: 'Work from London'
    }
  },
  {
    name: 'tokyo',
    variables: {
      bottom_text: 'Work from Tokyo'
    }
  },
  {
    name: 'berlin',
    variables: {
      bottom_text: 'Work from Berlin'
    }
  }
];

async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

async function sendToRenderer(sceneData, outputName, index, total) {
  const tempDir = path.join(__dirname, '.temp');
  const tempScenePath = path.join(tempDir, `${outputName}.zip`);
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.mp4`);

  await fs.promises.writeFile(tempScenePath, sceneData);

  try {
    console.log(`  [${index}/${total}] Processing ${outputName}...`);

    const startTime = Date.now();

    // Direct execution of cesdk-renderer with longer timeout
    // Use the working directory from environment (set in Dockerfile)
    const cesdkWorkDir = process.env.CESDK_WORKDIR || '/opt/cesdk-renderer';
    const child = execFile(
      '/opt/cesdk-renderer/cesdk-renderer',
      [
        '--input',
        tempScenePath,
        '--output',
        outputPath,
        '--render-device',
        'auto',
        '--verbose' // Add verbose flag if supported'
      ],
      {
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer for verbose output
        encoding: 'utf8',
        timeout: 300000, // 5 minute timeout
        cwd: cesdkWorkDir, // Run from cesdk-renderer's expected directory
        env: {
          ...process.env, // Inherits all env vars from Dockerfile
          IMGLY_LICENSE: LICENSE, // Override with user's license
          UBQ_AV_OVERRIDE_H264_ENCODER: 'nvh264enc',
          UBQ_AV_OVERRIDE_H265_ENCODER: 'nvh265enc',
          VERBOSE: '1' // Enable verbose output
        }
      }
    );

    // Collect output for logging only on failure
    let stdoutOutput = '';
    let stderrOutput = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });
    }

    // Wait for the process to complete
    await new Promise((resolve, reject) => {
      child.on('exit', (code, signal) => {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

        if (signal === 'SIGTERM') {
          console.error(`    ✗ Timed out after ${totalTime}s`);
          if (stderrOutput || stdoutOutput) {
            console.error(`    Output:`);
            if (stdoutOutput) console.error(`    stdout: ${stdoutOutput.slice(0, 500)}`);
            if (stderrOutput) console.error(`    stderr: ${stderrOutput.slice(0, 500)}`);
          }
          reject(new Error(`Process timed out`));
        } else if (code !== 0) {
          console.error(`    ✗ Failed (exit code ${code})`);
          if (stderrOutput || stdoutOutput) {
            console.error(`    Output:`);
            if (stdoutOutput) console.error(`    stdout: ${stdoutOutput.slice(0, 500)}`);
            if (stderrOutput) console.error(`    stderr: ${stderrOutput.slice(0, 500)}`);
          }
          reject(new Error(`Process exited with code ${code}`));
        } else {
          console.log(`    ✓ Completed in ${totalTime}s`);
          resolve({ code, signal });
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });

    // Verify output file was created (silent check)
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output file was not created');
    }

    // Clean up temp scene file
    await fs.promises.unlink(tempScenePath).catch(() => {});

    return outputPath;
  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}`);

    // Clean up temp scene file on error
    await fs.promises.unlink(tempScenePath).catch(() => {});

    throw error;
  }
}

async function main() {
  console.log('CE.SDK Renderer - Early Access Demo');
  console.log('=====================================\n');

  // Check license
  if (!LICENSE) {
    console.error('✗ IMGLY_LICENSE environment variable not set');
    console.log('\nPlease set your license:');
    console.log('  export IMGLY_LICENSE="your-license-key"');
    process.exit(1);
  }

  // Check input archive exists
  if (!fs.existsSync(INPUT_ARCHIVE)) {
    console.error(`✗ Input archive not found: ${INPUT_ARCHIVE}`);
    process.exit(1);
  }

  await ensureOutputDir();

  // Create temp directory
  const tempDir = path.join(__dirname, '.temp');
  await fs.promises.mkdir(tempDir, { recursive: true });

  console.log(`Input: ${path.basename(INPUT_ARCHIVE)}`);
  console.log(`Creating ${variations.length} variations...\n`);

  // Initialize CE.SDK engine
  const engine = await CreativeEngine.init({
    license: LICENSE
  });

  const results = [];
  const archiveUrl = `file://${INPUT_ARCHIVE}`;

  try {
    await engine.addDefaultAssetSources();

    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i];
      try {
        // Load the archive fresh for each variation
        await engine.scene.loadFromArchiveURL(archiveUrl);

        // Set variables globally using engine.variable.setString
        for (const [key, value] of Object.entries(variation.variables)) {
          const blocks = engine.block.findByName(key);
          if (blocks && blocks.length > 0) {
            engine.block.setString(blocks[0], 'text/text', value);
          }
        }

        // Save the modified scene to a Blob and convert to Buffer
        const modifiedSceneBlob = await engine.scene.saveToArchive();
        const modifiedSceneBuffer = Buffer.from(
          await modifiedSceneBlob.arrayBuffer()
        );

        // Send to renderer for rendering
        const outputPath = await sendToRenderer(
          modifiedSceneBuffer,
          variation.name,
          i + 1,
          variations.length
        );

        results.push({ name: variation.name, path: outputPath, success: true });
      } catch (error) {
        console.log(`  ✗ Failed: ${error.message}`);
        results.push({
          name: variation.name,
          error: error.message,
          success: false
        });
      }
    }
  } finally {
    engine.dispose();

    // Clean up temp directory
    const tempDir = path.join(__dirname, '.temp');
    await fs.promises
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => {});
  }

  // Summary
  console.log('\n=====================================');
  console.log('Processing Complete:');
  const successful = results.filter((r) => r.success).length;
  console.log(
    `✓ ${successful}/${variations.length} variations created successfully`
  );

  if (successful > 0) {
    console.log(
      `\nOutput files saved to: ${path.relative(process.cwd(), OUTPUT_DIR)}/`
    );
  }
}

// Run the script
main().catch((error) => {
  console.error('\n✗ Fatal error:', error.message);
  process.exit(1);
});
