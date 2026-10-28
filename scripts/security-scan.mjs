import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'security-reports');
mkdirSync(output, { recursive: true });
const save = (name, data) => writeFileSync(path.join(output, name), JSON.stringify(data, null, 2));
const runNode = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });

const lint = runNode(['node_modules/eslint/bin/eslint.js', '.', '--format', 'json']);
let lintResults = [];
let lintFailed = false;
try {
  lintResults = JSON.parse(lint.stdout);
  if (!Array.isArray(lintResults) || ![0, 1].includes(lint.status)) throw new Error('Incomplete lint scan');
  save('sonarjs.json', lintResults);
} catch {
  lintFailed = true;
  save('sonarjs.json', { error: 'Static analysis did not complete.' });
  console.error('Static analysis failed. Run npm run lint:security for diagnostics.');
}

// This deliberately reports only file/line/rule, never a matched credential value.
const excluded = new Set(['node_modules', 'dist', '.data', '.git', '.codex', '.agents', 'test-results', 'security-reports']);
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.gs', '.ts', '.tsx', '.json', '.md', '.html', '.css', '.ps1', '.cmd', '.example']);
const secretPatterns = [
  ['nvidia-key', /nvapi-[A-Za-z0-9_-]{30,}/g],
  ['provider-key', /sk-(?:proj-|ant-)?[A-Za-z0-9_-]{25,}/g],
  ['google-key', /AIza[0-9A-Za-z_-]{30,}/g],
  ['github-key', /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const secretFindings = [];
let filesScanned = 0;
function scanFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { scanFiles(file); continue; }
    if (!textExtensions.has(path.extname(entry.name)) && entry.name !== '.gitignore') continue;
    const source = readFileSync(file, 'utf8');
    filesScanned += 1;
    for (const [rule, pattern] of secretPatterns) {
      for (const match of source.matchAll(pattern)) secretFindings.push({ file: path.relative(root, file), line: source.slice(0, match.index).split('\n').length, rule });
    }
  }
}
scanFiles(root);
save('secrets.json', { filesScanned, findings: secretFindings, scope: 'High-confidence source/configuration patterns only. Excludes .env, runtime data, dependencies, logs and build output; not a complete secret detector.' });

let audit;
if (process.env.npm_execpath) {
  const result = runNode([process.env.npm_execpath, 'audit', '--json']);
  try { audit = JSON.parse(result.stdout); }
  catch { audit = { error: 'Dependency audit did not complete. Registry access is required.' }; }
} else {
  audit = { error: 'Run this check through npm run security:scan.' };
}
save('npm-audit.json', audit);
const summary = {
  generatedAt: new Date().toISOString(),
  staticAnalysis: { completed: !lintFailed, files: lintResults.length, errors: lintResults.reduce((n, f) => n + f.errorCount, 0), warnings: lintResults.reduce((n, f) => n + f.warningCount, 0) },
  secrets: { filesScanned, findings: secretFindings.length },
  dependencyAudit: { completed: !!audit.metadata && !audit.error, vulnerabilities: audit.metadata?.vulnerabilities ?? null },
};
save('summary.json', summary);
console.log(JSON.stringify(summary, null, 2));
console.log('Reports saved in security-reports/. Static findings are review items, not a count of confirmed vulnerabilities.');
process.exitCode = lintFailed || lint.status !== 0 || secretFindings.length || !summary.dependencyAudit.completed || audit.metadata?.vulnerabilities?.total > 0 ? 1 : 0;
