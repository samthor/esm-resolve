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


import * as types from './types/index.js';
import * as path from 'path';
import * as fs from 'fs';
import {statIsFile, statOrNull, isLocal, splitImport} from './lib/helper.js';
import {createRequire} from 'module';
import {matchModuleNode} from './lib/node.js';



/** @type {types.ResolverOptions} */
const defaults = {
  constraints: ['browser'],
  allowMissing: false,
  rewritePeerTypes: true,
  allowExportFallback: true,
  matchNakedMjs: false,
  includeMainFallback: true,
};


/**
 * Regexp that matches "../", "./" or "/" as a prefix.
 */
const relativeRegexp = /^\.{0,2}\//;


/**
 * Regexp that matches ".js" as a suffix.
 */
const matchJsSuffixRegexp = /\.js$/;


/**
 * Zero JS "file" that evaluates correctly.
 */
const zeroJsDefinitionsImport = 'data:text/javascript;charset=utf-8,/* was .d.ts only */';


/**
 * Search these fields for a potential legacy main module if a top-level package is imported.
 */
const modulePackageNames = [
  'module',
  'esnext:main',
  'esnext',
  'jsnext:main',
  'jsnext',
];


class Resolver {
  #importerDir;
  #require;

  /** @type {types.ResolverOptions} */
  #options;

  /**
   * @param {string} importerDir
   * @param {Partial<types.ResolverOptions>=} options
   */
  constructor(importerDir, options) {
    this.#options = Object.assign({}, defaults, options);

    importerDir = path.join(path.resolve(importerDir), path.sep);

    this.#importerDir = new URL(`file://${importerDir}`);
    this.#require = createRequire(importerDir);
  }

  /**
   * @return {{resolved?: string, info?: types.InternalPackageJson}}
   */
  loadSelfPackage() {
    const candidatePath = this.#require.resolve.paths('.')?.[0];
    if (candidatePath === undefined) {
      return {};
    }

    let info;
    try {
      const selfPackagePath = path.join(candidatePath, 'package.json');
      info = JSON.parse(fs.readFileSync(selfPackagePath, 'utf-8'));
    } catch (e) {
      return {};
    }
    return {info, resolved: candidatePath};
  }

  /**
   * @param {string} name
   * @return {{resolved?: string, info?: types.InternalPackageJson}}
   */
  loadPackage(name) {
    const candidatePaths = this.#require.resolve.paths(name);
    if (!candidatePaths?.length) {
      return {};
    }

    // If we literally are the named import, match it first.
    const self = this.loadSelfPackage();
    if (self.info?.['name'] === name) {
      return {resolved: self.resolved, info: self.info};
    }

    let packagePath;
    for (const p of candidatePaths) {
      const check = path.join(p, name, 'package.json');
      if (fs.existsSync(check)) {
        packagePath = check;
        break;
      }
    }
    if (!packagePath) {
      return {};
    }

    const info = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    return {resolved: path.dirname(packagePath), info};
  }

  /**
   * @param {string} pathname
   * @return {string=}
   */
  confirmPath(pathname) {
    const stat = statOrNull(pathname);
    if (stat && !stat.isDirectory()) {
      return pathname;
    }

    const extToCheck = this.#options.matchNakedMjs ? ['.js', '.mjs'] : ['.js'];

    if (stat === null) {
      // Look for a file with a suffix.
      for (const ext of extToCheck) {
        const check = pathname + ext;
        if (statIsFile(check)) {
          return check;
        }
      }

      if (this.#options.rewritePeerTypes) {
        // Special-case .d.ts files when there's no better option... because TypeScript.
        //   - importing a naked or '.js' file allows the adjacent '.d.ts'
        //   - this file doesn't really exist, so return a zero import
        const tsCheck = [pathname + '.d.ts', pathname.replace(matchJsSuffixRegexp, '.d.ts')];
        for (const check of tsCheck) {
          if (statIsFile(check)) {
            return zeroJsDefinitionsImport;
          }
        }
      }

    } else if (stat.isDirectory()) {
      // Look for index.js in the directory.
      for (const ext of extToCheck) {
        const check = path.join(pathname, `index${ext}`);
        if (statIsFile(check)) {
          return check;
        }
      }

      // Look for a solo index.d.ts in the directory, which TypeScript allows.
      if (this.#options.rewritePeerTypes && statIsFile(path.join(pathname, 'index.d.ts'))) {
        return zeroJsDefinitionsImport;
      }

    }
  }

  /**
   * @param {string} importee relative or naked string
   * @return {string|void}
   */
  nodeResolve(importee) {
    // Try to match subpath imports first. See Node's documentation:
    //   https://nodejs.org/api/packages.html#packages_subpath_imports
    // This allows local file resolution or picking another module, so check it first and fall
    // through to the external import process if required.
    if (importee.startsWith('#')) {
      const self = this.loadSelfPackage();
      if (!self.info || !self.resolved) {
        return;
      }

      const matched = matchModuleNode(self.info.imports ?? {}, importee, this.#options.constraints);
      if (!matched) {
        return;
      } else if (isLocal(matched)) {
        return `file://${path.join(self.resolved, matched)}`;
      }

      // This #import resolved to another package because it wasn't local. Continue below.
      importee = matched;
    }

    const {name, rest} = splitImport(importee);
    if (!name) {
      return;
    }

    const {resolved, info} = this.loadPackage(name);
    if (!resolved || !info) {
      return;
    }

    // If we find exports, then use a modern resolution mechanism.
    if (info.exports) {
      const matched = matchModuleNode(info.exports, rest, this.#options.constraints);
      if (matched) {
        if (!isLocal(matched)) {
          // This module is trying to export something that is not part of its own package.
          // This isn't allowed although perhaps we should let it happen.
          return;
        }
        return `file://${path.join(resolved, matched)}`;
      }

      if (!this.#options.allowExportFallback) {
        return;
      }
      // If we couldn't find a node, then fallback to running the legacy resolution algorithm. This
      // is agaist Node's rules: if an exports field is found, it's all that should be used.
    }

    // Check a few legacy options and fall back to allowing any path within the package.
    let simple = rest;
    if (simple === '.') {
      let found = false;
      for (const key of modulePackageNames) {
        if (typeof info[key] === 'string') {
          simple = /** @type {string} */ (info[key]);
          found = true;
          break;
        }
      }

      // If we can't find a name which implies a module import, optionally fall back to 'main' even
      // if the type of the package isn't correct.
      if (!found &&
          (this.#options.includeMainFallback || info['type'] === 'module') &&
          typeof info['main'] === 'string') {
        simple = info['main'];
      }
    }
    return `file://${path.join(resolved, simple)}`;
  }

  /**
   * @param {string} importee
   * @return {string=}
   */
  resolve(importee) {
    try {
      new URL(importee);
      return; // ignore, is valid URL
    } catch {}

    /** @type {URL} */
    let url;
    const resolved = this.nodeResolve(importee);
    if (resolved !== undefined) {
      // We get back file:// URLs, beacause Node doesn't care about our webserver.
      url = new URL(resolved);
      if (url.protocol !== 'file:') {
        throw new Error(`expected file:, was: ${url.toString()}`);
      }
    } else {
      url = new URL(importee, this.#importerDir);
    }

    let {pathname} = url;
    const suffix = url.search + url.hash;

    // Confirm the path actually exists (with extra node things).
    const confirmed = this.confirmPath(pathname);
    if (confirmed !== undefined) {
      pathname = confirmed;
    } else if (!this.#options.allowMissing) {
      return;
    }
    try {
      // confirmPath might return a data: URL, so check here.
      new URL(pathname);
      return pathname;
    } catch (e) {
      // ignore
    }
  
    // Find the relative path from the request.
    let out = path.relative(this.#importerDir.pathname, pathname);
    if (!relativeRegexp.test(out)) {
      out = `./${out}`;  // don't allow naked pathname
    }
    return out + suffix;
  }
}


/**
 * @param {string} importerDir
 * @param {Partial<types.ResolverOptions>=} options
 * @return {(importee: string) => string|undefined}
 */
export default function buildResolver(importerDir, options) {
  let handler = (importee) => {
    const r = new Resolver(importerDir, options);
    handler = r.resolve.bind(r);
    return handler(importee);
  };
  return (importee) => handler(importee);
}
