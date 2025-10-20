#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..');
const outputFile = path.join(frontendDir, 'env.js');

const rawBackendUrl = process.env.BACKEND_URL || '';
const backendUrl = rawBackendUrl.trim();

const envValues = {
  BACKEND_URL: backendUrl,
};

const fileContent = `window.ENV = Object.assign({}, window.ENV, ${JSON.stringify(envValues, null, 2)});
`;

fs.writeFileSync(outputFile, fileContent, 'utf8');

const displayValue = backendUrl || '(vacío, se usará el valor por defecto)';
console.log(`Archivo env.js generado con BACKEND_URL=${displayValue}`);
