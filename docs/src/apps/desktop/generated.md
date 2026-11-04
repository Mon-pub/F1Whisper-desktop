# Generated Code

## Safe Enums

Enums are declared in a package's enum schema, from which the `safe-enums` generator
(`packages/safe-enums`) generates the safe enum variants that are imported throughout the code. See
`packages/safe-enums/README.md` for how to write a schema, which package owns which enum, and how to
add a schema to a package.

The desktop app's generated module (`apps/desktop/src/common/enum/index.ts`) can be regenerated from
its schema (`apps/desktop/src/enum/schema.ts`) in the following way:

    pnpm run generate:desktop:safe-enums

The protocol package's generated module (`packages/protocol/src/enum/index.ts`), exposed as
`@threema/protocol/enum`, can be regenerated from its schema
(`packages/protocol/src/enum/schema.ts`) in the following way:

    pnpm run generate:protocol:safe-enums

To regenerate the enums of _all_ packages with a schema (which is what the CI drift check does):

    pnpm run generate:safe-enums

## Protocol Bindings (`packages/protocol`)

The protobuf and structbuf bindings for the Threema protocols are generated into
`packages/protocol/src/`.

The exact sources to generate from are pinned in the `pins` field of
`packages/protocol/package.json`:

- `threema-protocols`: the commit of the `threema-protocols` repository to generate from, and
- `structbuf-typescript`: the ref of the `structbuf-typescript` tool (used by the CI drift check).

To **bump** the protocol version, edit the `threema-protocols` pin, then regenerate. The pinned
commit is checked out in the `threema-protocols` repository before generating (and must exist in
that repository).

Generating both can be done in the following way:

    pnpm run update:protocol -- <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols-directory>

Alternatively, the protobuf and structbuf bindings can be generated individually:

    pnpm run generate:protocol:protobuf -- <path-to-threema-protocols-directory>
    pnpm run generate:protocol:structbuf -- <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols-directory>

## Internal Protobuf Files

The desktop-internal protobuf modules in `apps/desktop/src/common/internal-protobuf/` can be
regenerated in the following way:

    pnpm run generate:desktop:protobuf

This also runs automatically as part of the desktop app's `postinstall` hook on `pnpm install` (and
is skipped with a warning if `protoc` is missing or has the wrong version).

Note that `protoc`, the Protobuf compiler, must be installed in the pinned version (the `protoc`
entry in the `pins` field of `packages/protocol/package.json`), because `protoc` embeds its version
into the generated files. The devcontainer installs the pinned version automatically. To install it
manually, check the [official documentation](https://protobuf.dev/installation/).
