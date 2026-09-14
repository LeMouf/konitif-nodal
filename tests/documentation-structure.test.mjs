import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('package.json'));
const readme = read('README.md');

test('consumer README follows the public documentation contract', () => {
  const headings = [
    '## Installation',
    '## What it provides',
    '## Authority boundary',
    '## Quick start',
    '## Public entry points',
    '## Reference',
    '## License',
  ];
  let previous = -1;
  for (const heading of headings) {
    const position = readme.indexOf(heading);
    assert.ok(position > previous, `Missing or misplaced README section: ${heading}`);
    previous = position;
  }

  assert.doesNotMatch(
    readme,
    /AGENTS\.md|npm ci|npm run (?:build|test|verify)|NPM_PUBLISH_ENABLED|Trusted Publish|release authority|not published yet|public distribution candidate/i,
  );
  assert.doesNotMatch(readme, /Maxtronics|Behavior Studio|\bNAO(?:qi)?\b|Aldebaran|SoftBank/i);
});

test('reference artifacts use the shared English structure and ship with the package', () => {
  for (const path of ['reference/README.md', 'reference/catalog.json', 'reference/diagrams.json']) {
    assert.ok(existsSync(new URL(path, root)), `Missing ${path}`);
  }
  const catalogSource = read('reference/catalog.json');
  const diagramsSource = read('reference/diagrams.json');
  const catalog = JSON.parse(catalogSource);
  const diagrams = JSON.parse(diagramsSource);
  assert.equal(catalog.schemaVersion, '1.0.0');
  assert.equal(diagrams.schemaVersion, '1.0.0');
  assert.equal(catalog.package, manifest.name);
  assert.equal(diagrams.package, manifest.name);
  assert.ok(Array.isArray(catalog.clusters) && catalog.clusters.length > 0);
  assert.ok(Array.isArray(diagrams.diagrams) && diagrams.diagrams.length > 0);
  assert.doesNotMatch(catalogSource + diagramsSource, /\b(?:autorité|état|graphe|commande|exécution|lecture|réducteur|échantillon|déclarer|projeter)\b/i);

  const distributed = path => (manifest.files ?? []).some(entry =>
    entry === 'reference' || entry === path || (entry.endsWith('/') && path.startsWith(entry))
  );
  for (const path of ['reference/README.md', 'reference/catalog.json', 'reference/diagrams.json']) {
    assert.ok(distributed(path), `${path} is not included by package.json files`);
  }
});

