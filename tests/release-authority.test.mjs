import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertPublishingTools, assertReleaseInputs } from '../scripts/check-release.mjs';

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('release identity names the independent Nodal repository', () => {
  const manifest = json('package.json');
  assert.equal(manifest.repository.url, 'git+https://github.com/LeMouf/konitif-nodal.git');
  assert.match(manifest.version, /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(manifest.license, 'PolyForm-Noncommercial-1.0.0');
});

test('release inputs bind Nodal to its exact repository, lock and tag ref', () => {
  const lockUrl = new URL('../package-lock.json', import.meta.url);
  const policy = json('release-policy.json');
  const manifest = json('package.json');
  const lock = JSON.parse(readFileSync(lockUrl, 'utf8'));
  const base = {
    GITHUB_REPOSITORY: 'LeMouf/konitif-nodal',
    GITHUB_REF: `refs/tags/v${manifest.version}`
  };
  assert.doesNotThrow(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'push'
  }));
  assert.doesNotThrow(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    NODAL_RELEASE_TAG: `v${manifest.version}`
  }));
  assert.throws(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    NODAL_RELEASE_TAG: 'v0.284.2'
  }));
  assert.throws(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    NODAL_RELEASE_TAG: `v${manifest.version}`
  }));
});

test('Nodal release admission rejects stale or substituted lock identity', () => {
  const policy = json('release-policy.json');
  const manifest = json('package.json');
  const lock = json('package-lock.json');
  const env = {
    GITHUB_REPOSITORY: policy.repository,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: `refs/tags/v${manifest.version}`
  };
  for (const mutate of [
    value => { value.version = '0.284.2'; },
    value => { value.packages[''].version = '0.284.2'; },
    value => { value.packages[''].name = '@konitif/other'; },
    value => { value.packages[''].dependencies['@konitif/tools'] = '0.284.3'; }
  ]) {
    const inconsistent = structuredClone(lock);
    mutate(inconsistent);
    assert.throws(() => assertReleaseInputs(policy, manifest, inconsistent, env));
  }
});

test('Nodal publication requires preinstalled OIDC-capable tools', () => {
  assert.doesNotThrow(() => assertPublishingTools('24.20.0', '11.6.0'));
  assert.throws(() => assertPublishingTools('22.13.0', '11.6.0'));
  assert.throws(() => assertPublishingTools('24.20.0', '11.4.9'));
});

test('Nodal publish workflow is constrained to its release authority', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /vars\.NODAL_NPM_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /github\.repository == 'LeMouf\/konitif-nodal'/);
  assert.match(workflow, /environment: npm-release/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /test "\$\{GITHUB_REF\}" = "refs\/tags\/\$\{expected\}"/);
  assert.match(workflow, /merge-base --is-ancestor HEAD origin\/main/);
  assert.match(workflow, /npm publish \.release\/package\.tgz --access public --provenance --ignore-scripts/);
  assert.doesNotMatch(workflow, /npm install -g|npm update/);
});

test('Nodal release preparation retains only the verifier archive', () => {
  const script = readFileSync(new URL('../scripts/prepare-release-archive.mjs', import.meta.url), 'utf8');
  assert.match(script, /realpathSync\(evidence\.archive\)/);
  assert.match(script, /COPYFILE_EXCL/);
  assert.doesNotMatch(script, /npm pack|readdirSync/);
});
