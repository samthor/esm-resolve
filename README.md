[![Tests](https://github.com/samthor/esm-resolve/workflows/Tests/badge.svg)](https://github.com/samthor/esm-resolve/actions)

An ESM import resolver for Node written in pure JS.
This is written to be part of an [ESM dev server](https://github.com/samthor/dhost) or build process, as Node's import process is impossible to introspect.
It's also more permissive towards error cases and the default behavior of TypeScript (and therefore VSCode).

## Usage

Install and import "esm-resolve" via your favourite package manager.
Create a resolver based on the importing file.

```js
import buildResolver from 'esm-resolve';

const r = buildResolver('./path/to/js/file.js');

r('./relative');             // e.g., './relative.js'
r('foo-test-package-name');  // e.g., './node_modules/foo-test-package-name/index.js'
```

Resolution logic is actually the same for any files in the same directory, so resolver objects can be reused (and they have a small bit of cache).

### Options

You can [set options](./types/external.d.ts) via the second argument.
