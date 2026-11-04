# `@threema/safe-enums`

Generator for **safe enums**: namespaces of `const` + `type` pairs that emulate a TypeScript enum,
plus an optional `Utils` namespace with conversion, name-lookup and store-factory helpers.

Standard TypeScript enums are not type safe enough for this project (see
[here](https://stackoverflow.com/a/55459814) and
[here](https://github.com/microsoft/TypeScript/issues/32690)), so a lint rule bans `enum`
declarations everywhere except in a package's enum schema, from which this tool generates the safe
variants.

## Usage

Add this package as a devDependency, which puts the `safe-enums` command on the package's path:

```json
{
  "devDependencies": {
    "@threema/safe-enums": "workspace:*"
  },
  "scripts": {
    "generate:safe-enums": "safe-enums <schema-path> <output-path>"
  }
}
```

Then regenerate the package's enums with:

    pnpm run generate:safe-enums

Omitting the output path prints the generated module to standard output instead of writing it, which
is useful for debugging a schema. The output is formatted with Prettier (using the configuration
that applies to the output path), so no separate formatting step is needed. Generation happens fully
in memory and the output is written atomically, so a rejected schema leaves the previous generated
module untouched.

Generated modules are committed to the repository, and a CI job (`diff:safe-enums`) fails if a
generated module is out of sync with its schema.

## Writing a schema

TypeScript directives such as `// @ts-nocheck` are preserved and re-inserted into the generated file
if they appear at the very beginning of the schema file, even before any imports.

A schema may contain **import declarations** and **enum declarations**, and nothing else. Any other
statement is rejected, so a line added to a schema cannot silently do nothing.

```ts
import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import type {MonotonicEnumStore, StoreDebug} from '~/common/utils/store';

/**
 * Connection state.
 *
 * @generate convert name store
 */
export const enum ConnectionState {
  DISCONNECTED = 0,
  CONNECTING = 1,
  CONNECTED = 2,
}
```

Members must all have numeric initialisers, all have string initialisers, or all have none (in which
case they are numbered from zero). Leading comments of the enum and of each member are copied into
the generated module.

The `@generate` annotation requests the `Utils` namespace of an enum:

| Annotation | Generates                                                                                |
| ---------- | ---------------------------------------------------------------------------------------- |
| `convert`  | `ALL`, `fromNumber`/`fromString`, `containsNumber`/`containsString`, `contains`          |
| `name`     | `NAME_OF`, `nameOf`                                                                      |
| `store`    | `createStore` (implies `name`, requires `Logger`, `MonotonicEnumStore` and `StoreDebug`) |

### Imports

Import specifiers are copied verbatim into the generated module. Because the generated module does
not sit beside its schema, a **relative specifier would resolve from the wrong directory** and is
therefore rejected: use a path alias or a bare package specifier.

Imports the generated code does not reference are dropped, so a schema's import block declares what
is _available_ to generated code rather than what is emitted. This means it cannot go stale and
cannot produce an unused-import lint failure.

On the other hand, the generated utilities refer to some identifiers by name, e.g., `u53`, `Logger`,
`MonotonicEnumStore` and `StoreDebug`. A schema requesting those utilities must import the
identifiers under exactly those names, and is rejected otherwise. An alias that binds one of them to
a different name (e.g. `import type {Logger as Log}`) is therefore rejected as well, whereas an
alias _to_ such a name (e.g. `import type {CustomLogger as Logger}`) is fine.

Imports are emitted as top-level type-only imports (`import type {Foo} from ...`) rather than as
inline type modifiers (`import {type Foo} from ...`), because only the former is elided completely
under `verbatimModuleSyntax`. Generated modules therefore compile under the workspace-standard
TypeScript configuration and introduce no runtime module dependencies.

## Which package owns an enum?

Every package that needs enums owns a schema and a generated module of its own, and consumers import
constants from the package that owns them, by name. There is no re-export barrel, so the import site
shows which package owns a constant.

An enum belongs to:

- **`@threema/protocol`**, if its values are defined by the Threema protocol or appear on the wire;
- **`@threema/domain`**, if it is part of the domain model;
- **the application it is used in**, if its values are defined by that application's own
  implementation choices.

## Tests

The generator is covered by golden-file tests in `test/`, which generate the schemas in
`test/fixtures/` and compare the result against the expected modules beside them:

    pnpm run test:vitest

To refresh the expected modules after an intended change to the emitted output, run
`pnpm exec vitest run --update` and review the resulting diff.
