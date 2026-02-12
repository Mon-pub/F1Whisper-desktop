# Updating libthreema

Whenever an update of libthreema is necessary, you can run the following command from the root of
the monorepo:

```
pnpm run update:libthreema -- <path-to-libthreema-repository> <commit-hash>
```

Note: `<path-to-libthreema-repository>` can be an absolute path, or a path relative to the root path
of the `packages/libthreema-wasm` package.

This script:

1. Checks out the specified commit in the libthreema source repository.
2. Copies the source code at the respective commit to the `libthreema-wasm` package.
3. Runs the cleanup scripts for libthreema and threema-protocols.

After that, commit the changes as: `Upgrade libthreema: x.y.z → x.y.z`. **Important:** Make sure
that the cleanup scripts were correctly run before you push the changes.

Note: Updating libthreema will delete any existing build outputs in the `libthreema-wasm` package,
which means libthreema will be rebuilt the next time a task (which depends on the `libthreema-wasm`
package) runs.
