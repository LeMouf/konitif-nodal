import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyInstalledDependencies } from './copy-installed-dependencies.mjs';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const evidence = mkdtempSync(join(tmpdir(), `${manifest.name.split('/')[1]}-package-`));
const cache = join(evidence, 'npm-cache');
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false', npm_config_cache: cache },
});

const npmCli = process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
assert.ok(existsSync(npmCli), `Installed npm CLI required at ${npmCli}`);
const archiveDirectory = join(evidence, 'archive');
mkdirSync(archiveDirectory, { recursive: true });
const packed = JSON.parse(run(process.execPath, [
  npmCli,
  'pack',
  '--offline',
  '--ignore-scripts',
  '--json',
  '--pack-destination', archiveDirectory,
]))[0];
const files = packed.files.map(file => file.path).sort();
for (const model of ['nodalCoordinateModel', 'nodalProjectionModel', 'nodalInteractionModel', 'nodalConnectionInteractionModel', 'nodalPortStateModel', 'nodalGroupLayoutModel', 'nodalPortSuggestionModel']) {
  for (const extension of ['js', 'd.ts']) assert.ok(files.includes(`dist/projection/${model}.${extension}`), model);
}
for (const file of files) assert.match(file, /^(dist\/|reference\/|package\.json$|README\.md$|LICENSE\.md$)/);
for (const file of ['dist/index.js', 'dist/index.d.ts', 'reference/README.md', 'reference/catalog.json', 'reference/diagrams.json', 'README.md', 'LICENSE.md', 'package.json']) {
  assert.ok(files.includes(file), file);
}

const consumer = join(evidence, 'consumer');
const installedPackage = join(consumer, 'node_modules', ...manifest.name.split('/'));
mkdirSync(installedPackage, { recursive: true });
const archive = join(archiveDirectory, packed.filename);
run('tar', ['-xzf', archive, '-C', installedPackage, '--strip-components=1']);
const dependencies = copyInstalledDependencies(root, consumer);
cpSync(join(root, 'tests/consumer.mts'), join(consumer, 'consumer.mts'));
const compilerCandidates = [
  join(root, 'node_modules/typescript/bin/tsc'),
  join(root, '../../node_modules/typescript/bin/tsc'),
];
const compiler = compilerCandidates.find(existsSync);
assert.ok(compiler, 'Installed TypeScript compiler required');
run(process.execPath, [compiler, '--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], consumer);
run(process.execPath, ['--input-type=module', '-e', `const module = await import(${JSON.stringify(manifest.name)}); if (!Object.keys(module).length) throw new Error('Empty public module'); if (typeof document !== 'undefined') throw new Error('Unexpected DOM'); if (module.getNodalConnectorKey('node', 'value', 'output') !== 'node:output:value') throw new Error('Invalid connector identity'); const point = module.worldToScreenPoint({ x: 12, y: 8 }, { x: 3, y: 4, zoom: 2 }); if (point.x !== 27 || point.y !== 20) throw new Error('Invalid coordinate projection');`], consumer);

const bytes = readFileSync(archive);
console.log(JSON.stringify({
  status: 'passed',
  name: manifest.name,
  version: manifest.version,
  dependencies,
  integrity: packed.integrity,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  files: files.length,
  consumer: 'isolated ESM and strict NodeNext declarations',
  evidence,
  archive,
}, null, 2));
