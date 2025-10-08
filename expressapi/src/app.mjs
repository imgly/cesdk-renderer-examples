/* eslint-disable no-console */
import express from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const processorPath =
  process.env.IMGLY_PROCESSOR_PATH || '/opt/cesdk-processor/cesdk-processor';
const processorPwd =
  process.env.IMGLY_PROCESSOR_PATH || '/opt/cesdk-processor/';

const execFileAsync = promisify(execFile);
const app = express();
const port = 8080;
const upload = multer({ dest: '/uploads/' });

app.post('/export', upload.single('scene'), async (req, res) => {
  const sceneFile = req.file;
  const inputPath = `/uploads/${sceneFile.filename}`;
  const outputPath = `/exports/${sceneFile.filename}.png`;

  const { error, stdout, stderr } = await execFileAsync(
    processorPath,
    [
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--dpi',
      '300',
      // Allow CPU rendering for demonstration purposes
      '--render-device',
      'auto'
    ],
    { cwd: processorPwd }
  );

  if (error) {
    console.error(error);
    res.status(500).send(`Error processing scene file: ${stderr}`);
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    } catch (error) {
      console.error(`Error deleting files: ${error}`);
    }
    return;
  }

  try {
    fs.unlinkSync(inputPath);
  } catch (error) {
    console.error(`Error deleting input file: ${error}`);
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${sceneFile.originalname.replace('.scene', '.png')}"`
  );
  res.sendFile(outputPath, (err) => {
    try {
      fs.unlinkSync(outputPath);
    } catch (error) {
      console.error(`Error deleting output file: ${error}`);
    }
  });
});

app.use(express.static('public'));

app.listen(port, () => {
  console.log(`CE.SDK Processor Express API demo listening on port ${port}`);
});
