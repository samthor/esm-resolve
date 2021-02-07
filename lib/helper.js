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


import * as fs from 'fs';


/**
 * @param {string} p
 */
export const statOrNull = (p) => {
  try {
    return fs.statSync(p);
  } catch (e) {
    return null;
  }
};


/**
 * @param {string} p
 * @return {boolean}
 */
export const statIsFile = (p) => statOrNull(p)?.isFile() ?? false;


/**
 * @param {string} p
 * @return {boolean}
 */
export const isLocal = (p) => p === '.' || p.startsWith('./');


/**
 * @param {string} importee
 * @return {{name?: string, rest: string}}
 */
export function splitImport(importee) {
  const name = importee.split('/', 1)[0];
  if (!name || name.startsWith('.')) {
    return {rest: importee};
  }
  return {name, rest: '.' + importee.substr(name.length)};
}
