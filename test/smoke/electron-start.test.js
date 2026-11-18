'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('Electron starts the app and renders the pet window', { timeout: 35000 }, async () => {
  const electron = require('electron');
  const appPath = path.resolve(__dirname, '..', '..');
  const child = spawn(electron, [appPath], {
    cwd: appPath,
    env: { ...process.env, PIP_SMOKE_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Electron startup timed out.\n${output}`));
    }, 30000);
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });

  assert.match(output, /PIP_ELECTRON_SMOKE_READY/, `Smoke marker missing. Electron output:\n${output}`);
  assert.equal(result.code, 0, `Electron exited with ${result.signal || result.code}.\n${output}`);
});
