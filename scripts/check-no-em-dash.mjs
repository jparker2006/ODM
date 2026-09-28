// Fails if any tracked text file contains an em dash (project style rule).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && /\.(ts|js|mjs|py|md|json|html|css|sh)$/.test(f) && !f.startsWith('node_modules/'));
const bad = [];
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    if (line.includes('—')) bad.push(`${f}:${i + 1}`);
  });
}
if (bad.length) {
  console.error('Em dashes found:\n' + bad.join('\n'));
  process.exit(1);
}
