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
 
import test from 'ava';
import * as fs from 'fs';

import buildResolver from '../index.js';

const r = buildResolver('./testdata/fake.js');
const nodeResolver = buildResolver('./testdata/fake.js', {constraints: ['node']});

const {pathname: packageJSONPath} = new URL('../testdata/package.json', import.meta.url);
/** @type {string} */
const fakePackageName = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8')).name;

test('resolves legacy import', t => {
  t.is('./node_modules/fake-package/esm.mjs', r('fake-package'), 'default import is returned');
  t.is('./node_modules/fake-package/index.js', r('fake-package/index.js'), 'real path is allowed');
  t.is(undefined, r('fake-package/index-doesnotexist.js'), 'missing path is skipped');
});

test('resolves constraint exports', t => {
  t.is('./node_modules/exports-package/node.js#browser', r('exports-package'), 'browser import is returned, not node');
  t.is('./node_modules/exports-package/node.js#node', nodeResolver('exports-package'), 'specific constraints exports node');
});

test('resolves star exports', t => {
  t.is('./node_modules/exports-package/bar/other.js', r('exports-package/foo/other.js'));
  t.is(undefined, r('exports-package/foo'), 'star imports do not export index.js');

  // nb. Technically these following aren't resolved by Node either, but we'll allow it.
  t.is('./node_modules/exports-package/bar/other.js', r('exports-package/foo/other'));
  t.is('./node_modules/exports-package/bar/index.js', r('exports-package/foo/index'));
});

test('falls back to open', t => {
  t.is('./node_modules/exports-package/bar/other.js', r('exports-package/bar/other'), 'allows unexported file anyway');
});

test('hides .d.ts only', t => {
  const out1 = r('fake-package/solo-types.js');
  t.assert(out1?.startsWith('data:text/javascript;'), 'should hide with empty base64');

  const out2 = r('./node_modules/fake-package/solo-types.js');
  t.assert(out2?.startsWith('data:text/javascript;'), 'hides even while not resolving');

  const out3 = r('fake-package/peer-types.js');
  t.is(out3, './node_modules/fake-package/peer-types.js', 'don\'t hide with peer file');
});

test('resolves self-package', t => {
  t.is(r(fakePackageName), './blah/file.js');
  t.is(r(`${fakePackageName}/package.json`), './package.json');
});

test('resolves internal exports', t => {
  t.is(r('#secret'), './blah/file.js#secret');
  t.is(r('#self'), './blah/file.js');
  t.is(r('#other'), './node_modules/exports-package/node.js#browser');
  t.is(r('#other/package.json'), undefined, 'doesn\'t fall through, longer string not in imports');
  t.is(r('#other-any/package.json'), './node_modules/exports-package/package.json', 'falls through due to /*');
});

test('resolves @user imports', t => {
  t.is(r('@user/thing'), './node_modules/@user/thing/test.js');
});
