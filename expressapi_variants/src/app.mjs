/* eslint-disable no-console */
import bodyParser from 'body-parser';
import express from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import CreativeEngine from '@cesdk/node';

const engineConfig = {
  license: process.env.IMGLY_LICENSE
};

const rendererPath =
  process.env.CESDK_RENDERER_PATH || '/opt/cesdk-renderer/cesdk-renderer';
const rendererPwd =
  process.env.CESDK_RENDERER_PATH || '/opt/cesdk-renderer/';

const pageSizesOfInterest = [
  'page-sizes-instagram-square',
  'page-sizes-instagram-landscape',
  'print-sizes-din-a5-landscape'
];

const execFileAsync = promisify(execFile);
const app = express();
const port = 8080;
const upload = multer({ dest: '/uploads/' });

app.use(bodyParser.urlencoded({ extended: true }));

app.post('/export', upload.single('scene'), async (req, res) => {
  const sceneFile = req.file;
  const inputPath = `/uploads/${sceneFile.filename}`;
  const variants = [];

  const variableName = req.body.text_variable;
  const variableValue = req.body.variable_value;

  const engine = await CreativeEngine.init(engineConfig);
  try {
    await engine.addDefaultAssetSources();
    const scene = await engine.scene.loadFromURL(`file://${inputPath}`);

    const allPages = engine.scene.getPages();

    const pageSizes = (
      await engine.asset.findAssets('ly.img.page.presets', {
        perPage: 200,
        page: 0
      })
    ).assets;
    // Generate the scene files for all page size variants
    for (const pageSize of pageSizesOfInterest) {
      const asset = pageSizes.find((asset) => asset.id === pageSize);
      if (!asset) {
        console.error(`Page size asset ${pageSize} not found`);
        continue;
      }

      const designUnit = asset.payload.transformPreset.designUnit;
      const width = asset.payload.transformPreset.width;
      const height = asset.payload.transformPreset.height;
      const fixedOrientation = asset.meta?.fixedOrientation
        ? asset.meta?.fixedOrientation.toString()
        : 'false';
      const sceneDpi = designUnit === 'Pixel' ? 72 : 300;
      const assetSourceId = asset.context.sourceId;

      await Promise.all(
        allPages.map((page) =>
          engine.asset.applyToBlock(assetSourceId, asset, page)
        )
      );
      engine.block.setFloat(scene, 'scene/dpi', sceneDpi);
      engine.scene.setDesignUnit(designUnit);
      engine.block.setString(scene, 'scene/pageFormatId', asset.id);
      engine.block.setFloat(scene, 'scene/pageDimensions/width', width);
      engine.block.setFloat(scene, 'scene/pageDimensions/height', height);
      engine.block.setMetadata(scene, 'fixedOrientation', fixedOrientation);
      const newScene = await engine.scene.saveToString();
      const variantScene = `${inputPath}-${pageSize}.scene`;
      const variantPng = `/exports/${sceneFile.filename}-${pageSize}.png`;
      await promisify(fs.writeFile)(variantScene, newScene);
      variants.push({ scene: variantScene, png: variantPng, dpi: sceneDpi });
    }
  } catch (error) {
    console.error(`Error loading scene file: ${error}: ${error.stack}`);
    res.status(500).send(`Error loading scene file: ${error}: ${error.stack}`);
    return;
  } finally {
    engine.dispose();
  }

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
          '--text',
          `${variableName}=${variableValue}`,
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
});

app.use(express.static('public'));

app.listen(port, () => {
  console.log(
    `CE.SDK Renderer Express variant generation API demo listening on port ${port}`
  );
});
