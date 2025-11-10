/* eslint-disable no-console */
import express from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

// highlight-new-imports
import CreativeEngine from '@cesdk/node';
// highlight-new-imports

const rendererPath =
  process.env.CESDK_RENDERER_PATH || '/opt/cesdk-renderer/cesdk-renderer';
const rendererPwd = process.env.CESDK_RENDERER_PATH || '/opt/cesdk-renderer/';

const execFileAsync = promisify(execFile);
const app = express();
const port = 8080;

// highlight-new-setup
const engineConfig = {
  license: process.env.IMGLY_LICENSE
};
// highlight-new-setup

const upload = multer({ dest: '/uploads/' });

// highlight-endpoint
app.post('/export', upload.single('scene'), async (req, res) => {
  const sceneFile = req.file;
  const inputPath = `/uploads/${sceneFile.filename}`;
  const variants = [];
  // highlight-endpoint

  // highlight-engine-init
  const engine = await CreativeEngine.init(engineConfig);
  try {
    await engine.addDefaultAssetSources();
    const scene = await engine.scene.loadFromURL(`file://${inputPath}`);
    // highlight-engine-init

    // highlight-engine-vars
    // Generate the scene files for all variable substitutions
    for (const firstName of ['Alice', 'Bob', 'Charlotte', 'David']) {
      engine.variable.setString('firstName', firstName);
      const newScene = await engine.scene.saveToArchive();
      const variantScene = `${inputPath}-${firstName}.zip`;
      const variantPng = `/exports/${sceneFile.filename}-${firstName}.png`;
      await promisify(fs.writeFile)(variantScene, newScene);
      variants.push({ scene: variantScene, png: variantPng, dpi: 150 });
    }
  } catch (error) {
    console.error(`Error loading scene file: ${error}: ${error.stack}`);
    res.status(500).send(`Error loading scene file: ${error}: ${error.stack}`);
    return;
  } finally {
    engine.dispose();
  }
  // highlight-engine-vars

  // highlight-export
  // Export each scene file to a png in parallel
  await Promise.all(
    variants.map(async (variant) => {
      const { error, stdout, stderr } = await execFileAsync(
        rendererPath,
        [
          '--input',
          variant.scene,
          '--output',
          variant.png,
          '--dpi',
          variant.dpi.toString(),
          // Allow CPU rendering for demonstration purposes
          '--render-device',
          'auto'
        ],
        { cwd: rendererPwd }
      );

      if (error) {
        console.error(error);
        res.status(500).send(`Error processing scene file: ${stderr}`);
        try {
          fs.unlinkSync(variant.scene);
          fs.unlinkSync(variant.png);
        } catch (error) {
          console.error(`Error deleting files: ${error}`);
        }
        throw error;
      }

      try {
        fs.unlinkSync(variant.scene);
      } catch (error) {
        console.error(`Error deleting input file: ${error}`);
      }
    })
  );
  // highlight-export

  // highlight-zip
  // Zip the variants together
  const zipPath = `/exports/${sceneFile.filename}-variants.zip`;
  const { error, stdout, stderr } = await execFileAsync('/usr/bin/zip', [
    '-j',
    zipPath,
    ...variants.map((variant) => variant.png)
  ]);

  if (error) {
    console.error(error);
    res.status(500).send(`Error zipping variants: ${stderr}`);
    return;
  }
  // highlight-zip

  // highlight-return
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sceneFile.originalname.replace('.scene', '.zip')}"`
  );
  res.sendFile(zipPath, (err) => {
    try {
      fs.unlinkSync(zipPath);
    } catch (error) {
      console.error(`Error deleting output file: ${error}`);
    }
  });

  // End of app.post( ...
});
// highlight-return

app.use(express.static('public'));

app.listen(port, () => {
  console.log(
    `CE.SDK Renderer Express variant generation API demo listening on port ${port}`
  );
});
