/*
 * Copyright 2021 Sam Thorogood.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import buildResolver from '../index.ts';

const r = buildResolver('./testdata/fake.js');
const deepResolver = buildResolver('./testdata/deep/fake.js');
const nodeResolver = buildResolver('./testdata/fake.js', { constraints: ['node'] });

const { pathname: packageJSONPath } = new URL('../testdata/package.json', import.meta.url);
const fakePackageName: string = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8')).name;

test('resolves legacy import', (t) => {
  assert.strictEqual(
    './node_modules/fake-package/esm.mjs',
    r('fake-package'),
    'default import is returned',
  );
  assert.strictEqual(
    './node_modules/fake-package/index.js',
    r('fake-package/index.js'),
    'real path is allowed',
  );
  assert.strictEqual(undefined, r('fake-package/index-doesnotexist.js'), 'missing path is skipped');
});

test('resolves constraint exports', (t) => {
  assert.strictEqual(
    './node_modules/exports-package/node.js#browser',
    r('exports-package'),
    'browser import is returned, not node',
  );
  assert.strictEqual(
    './node_modules/exports-package/node.js#node',
    nodeResolver('exports-package'),
    'specific constraints exports node',
  );
});

test('resolves star exports', (t) => {
  assert.strictEqual(
    './node_modules/exports-package/bar/other.js',
    r('exports-package/foo/other.js'),
  );
  assert.strictEqual(undefined, r('exports-package/foo'), 'star imports do not export index.js');

  // nb. Technically these following aren't resolved by Node either, but we'll allow it.
  assert.strictEqual('./node_modules/exports-package/bar/other.js', r('exports-package/foo/other'));
  assert.strictEqual('./node_modules/exports-package/bar/index.js', r('exports-package/foo/index'));
});

test('falls back to open', (t) => {
  assert.strictEqual(
    './node_modules/exports-package/bar/other.js',
    r('exports-package/bar/other'),
    'allows unexported file anyway',
  );
});

test('hides .d.ts only', (t) => {
  const out1 = r('fake-package/solo-types.js');
  assert.ok(out1?.startsWith('data:text/javascript;'), 'should hide with empty base64');

  const out2 = r('./node_modules/fake-package/solo-types.js');
  assert.ok(out2?.startsWith('data:text/javascript;'), 'hides even while not resolving');

  const out3 = r('fake-package/peer-types.js');
  assert.strictEqual(
    out3,
    './node_modules/fake-package/peer-types.js',
    "don't hide with peer file",
  );
});

test('resolves self-package', (t) => {
  assert.strictEqual(r(fakePackageName), './blah/file.js');
  assert.strictEqual(r(`${fakePackageName}/package.json`), './package.json');
  assert.strictEqual(deepResolver(fakePackageName), '../blah/file.js');
});

test('resolves internal exports', (t) => {
  assert.strictEqual(r('#secret'), './blah/file.js#secret');
  assert.strictEqual(r('#self'), './blah/file.js');
  assert.strictEqual(r('#other'), './node_modules/exports-package/node.js#browser');
  assert.strictEqual(
    r('#other/package.json'),
    undefined,
    "doesn't fall through, longer string not in imports",
  );
  assert.strictEqual(
    r('#other-any/package.json'),
    './node_modules/exports-package/package.json',
    'falls through due to /*',
  );
  assert.strictEqual(deepResolver('#self'), '../blah/file.js');
  assert.strictEqual(deepResolver('#secret'), '../blah/file.js#secret');
  assert.strictEqual(deepResolver('#other'), '../node_modules/exports-package/node.js#browser');
});

test('resolves @user imports', (t) => {
  assert.strictEqual(r('@user/thing'), './node_modules/@user/thing/test.js');
  assert.strictEqual(
    r('@user'),
    undefined,
    'user import should not trigger as it creates ambiguities',
  );
});

test('supports nested "bad" packages', (t) => {
  assert.strictEqual(
    r('bad-package/subpackage'),
    './node_modules/bad-package/subpackage/sub-bad-index.js',
  );
});

test('resolves peer imports', (t) => {
  const mjsResolver = buildResolver('./testdata/fake.js', { matchNakedMjs: true });
  assert.strictEqual(mjsResolver('./only-mjs'), './only-mjs.mjs');
  assert.strictEqual(r('./optional-mjs'), './optional-mjs.js', 'prefer JS over MJS');
});

test('isDir', () => {
  const r1 = buildResolver('./testdata/fake.js', { allowMissing: true, resolveToAbsolute: true });
  const r2 = buildResolver('./testdata', {
    allowMissing: true,
    resolveToAbsolute: true,
    isDir: true,
  });
  const r3slash = buildResolver('./testdata/', {
    allowMissing: true,
    resolveToAbsolute: true,
    isDir: true,
  });
  // "bad", will resolve in parent dir
  const r4bad = buildResolver('./testdata', {
    allowMissing: true,
    resolveToAbsolute: true,
    isDir: false,
  });

  assert.strictEqual(r1('./fake.js'), r2('./fake.js'));
  assert.strictEqual(r2('./fake.js'), r3slash('./fake.js'));
  assert.notStrictEqual(r2('./fake.js'), r4bad('./fake.js'));
});
