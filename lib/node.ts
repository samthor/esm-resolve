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

import * as types from '../types/index.js';
import * as path from 'path';
import { isLocal } from './helper.js';

// TODO(samthor): This includes 'module' to work around a problem in a certain popular JS library.
const alwaysConstraints = ['module', 'import'];

function matchModuleNodePath(
  exports: types.InternalPackageModuleNode,
  rest: string,
): {
  node?: types.InternalPackageModuleNode;
  subpath?: string;
} {
  if (typeof exports !== 'object') {
    return { node: exports };
  }
  let fallback;

  for (const key in exports) {
    if (!key.startsWith('#') && !isLocal(key)) {
      fallback = exports; // it might be "import" and so on
      continue;
    }
    if (key === rest) {
      return { node: exports[key] };
    }

    // Look for keys ending with /*.
    if (!key.endsWith('/*')) {
      continue;
    }
    const prefix = key.substring(0, key.length - 1);
    if (!(rest.startsWith(prefix) && rest.length > prefix.length)) {
      continue;
    }
    const subpath = rest.substring(prefix.length);
    if (path.normalize(subpath) !== subpath) {
      continue; // node prevents conditional escaping path or having "."
    }

    return { node: exports[key], subpath };
  }

  if (fallback) {
    return { node: fallback };
  }
  return {};
}

export function matchModuleNode(
  exports: types.InternalPackageModuleNode,
  rest: string,
  constraints: string[],
): string | void {
  let { node, subpath } = matchModuleNodePath(exports, rest);

  // Traverse looking for the best conditional. These can be nested.
  restart: while (node && typeof node !== 'string') {
    for (const key in node) {
      if (alwaysConstraints.includes(key) || constraints.includes(key)) {
        node = node[key];
        continue restart;
      }
    }
    node = node['default'];
  }
  if (!node) {
    return;
  }

  if (subpath) {
    node = node.replace(/\*/g, subpath);
  }
  return node;
}
