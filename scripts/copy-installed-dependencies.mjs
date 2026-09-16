import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

// Canonical template: standalone verifiers carry an identical local copy.
// Reuse installed artifacts only; never resolve from a registry or install.
export function copyInstalledDependencies(sourceRoot, consumerRoot) {
  const records = [];
  const readManifest = directory => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));

  function copyOwnerDependencies(sourceOwner, consumerOwner, ancestors) {
    const owner = readManifest(sourceOwner);
    for (const [name, expectedVersion] of Object.entries(owner.dependencies ?? {})) {
      assert.match(name, /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 'Invalid dependency name');
      assert.match(expectedVersion, /^\d+\.\d+\.\d+$/, `${owner.name}: exact installed dependency pin required for ${name}`);
      const search = createRequire(join(sourceOwner, 'package.json')).resolve.paths(name) ?? [];
      const installed = search.map(directory => join(directory, name))
        .find(directory => existsSync(join(directory, 'package.json')));
      assert.ok(installed, `${owner.name}: installed dependency required: ${name}@${expectedVersion}`);
      const source = realpathSync(installed);
      const manifest = readManifest(source);
      assert.equal(manifest.name, name, `${owner.name}: installed dependency identity mismatch`);
      assert.equal(manifest.version, expectedVersion, `${owner.name}: installed dependency version mismatch for ${name}`);
      assert.ok(!ancestors.has(source), `${owner.name}: cyclic installed closure requires explicit preparation: ${name}`);

      const target = join(consumerOwner, 'node_modules', name);
      assert.ok(!existsSync(target), `Consumer dependency target already exists: ${target}`);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target, {
        recursive: true,
        dereference: true,
        filter: file => file === source || !relative(source, file).split(sep).includes('node_modules')
      });
      records.push({ name, version: manifest.version, target: relative(consumerRoot, target).split(sep).join('/') });
      copyOwnerDependencies(source, target, new Set([...ancestors, source]));
    }
  }

  copyOwnerDependencies(realpathSync(sourceRoot), consumerRoot, new Set([realpathSync(sourceRoot)]));
  return records;
}
