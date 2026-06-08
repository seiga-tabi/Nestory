const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const files = [path.join(rootDir, 'server.js')];

function collectJavaScriptFiles(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(fullPath);
      return;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  });
}

collectJavaScriptFiles(path.join(rootDir, 'server'));
collectJavaScriptFiles(path.join(rootDir, 'prisma'));

let failed = false;
files.forEach((file) => {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
});

if (failed) process.exit(1);
console.log(`Checked ${files.length} backend JavaScript files.`);
