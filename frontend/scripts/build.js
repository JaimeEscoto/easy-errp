#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const frontendDir = path.join(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');

const runGenerateEnv = () => {
  const result = spawnSync('node', [path.join(__dirname, 'generate-env.js')], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error('Fallo al generar env.js');
  }
};

const cleanDist = () => {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
};

const copyDirectoryRecursive = (sourceDir, destinationDir) => {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  fs.mkdirSync(destinationDir, { recursive: true });

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  });
};

const copyFiles = () => {
  const staticFiles = ['app.js', 'config.js', 'styles.css', 'theme.css', 'env.js'];
  const htmlFiles = fs
    .readdirSync(frontendDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name);

  const filesToCopy = [...new Set([...htmlFiles, ...staticFiles])];

  filesToCopy.forEach((fileName) => {
    const sourcePath = path.join(frontendDir, fileName);
    const destinationPath = path.join(distDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`No se encontró el archivo requerido: ${fileName}`);
    }

    fs.copyFileSync(sourcePath, destinationPath);
  });

  copyDirectoryRecursive(path.join(frontendDir, 'scripts'), path.join(distDir, 'scripts'));
};

const main = () => {
  runGenerateEnv();
  cleanDist();
  copyFiles();
  console.log(`Archivos estáticos preparados en ${path.relative(frontendDir, distDir)}`);
};

main();
