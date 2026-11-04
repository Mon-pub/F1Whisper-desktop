# Updating `better-sqlcipher3`

Single-source checklist for updating `better-sqlite3` to a new upstream `better-sqlcipher` release
with SQLCipher + BearSSL.

## 0 — Set versions

Determine the target versions before starting. All three values are referenced throughout.

```bash
export BETTER_SQLITE3_VERSION=12.10.0   # https://github.com/WiseLibs/better-sqlite3/releases
export SQLCIPHER_VERSION=4.16.0        # https://github.com/sqlcipher/sqlcipher/blob/master/CHANGELOG.md
export BEARSSL_VERSION=0.6             # https://bearssl.org/#status
```

---

## 1 — SQLCipher fork (BearSSL branch)

**Repo:** internal `sqlcipher` fork

- [ ] Fetch upstream tags from `sqlcipher/sqlcipher`
- [ ] Create branch `bearssl-crypto-provider-${SQLCIPHER_VERSION}` based on the upstream tag
      `v${SQLCIPHER_VERSION}`
- [ ] Cherry-pick the **"Add BearSSL as a crypto provider"** and **"Add bearssl setup to
      `sqlcipher.c`"** commits from the previous `bearssl-crypto-provider-*` branch
- [ ] Resolve any conflicts
- [ ] Push the branch

---

## 2 — Update patches (`better-sqlcipher-patch`)

**Repo:** internal `better-sqlcipher-patch`

This is the most labor-intensive step. Patches live in `patches/` and must be kept in sync with the
new upstream `better-sqlite3` version.

### 2a — Audit each patch file

For every file in `patches/`, check whether the upstream context it targets has changed. Common
trouble spots:

| Patch file                       | What to check                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patches/package.json.patch`     | Package name, version string, dependency versions                                                                                                                             |
| `patches/binding.gyp.patch       | Build target changes, new source files upstream                                                                                                                               |
| `patches/deps/common.gypi.patch` | SQLCipher version reference, compiler flags                                                                                                                                   |
| `patches/lib/index.d.ts`         | Compare against [DefinitelyTyped master](https://github.com/DefinitelyTyped/DefinitelyTyped/commits/master/types/better-sqlite3/index.d.ts) for new/changed type declarations |

**Tip:** look at the `better-sqlite3` changelog and diff between the old and new tags to find what
moved:

```bash
# In a better-sqlite3 checkout
git diff v${OLD_VERSION}..v${BETTER_SQLITE3_VERSION} -- package.json deps/ ':!deps/sqlite3' binding.gyp
```

### 2b — Update patch contents

Edit the patch files so they apply cleanly against the new upstream tag. Refer to older patch-update
commits in the `better-sqlcipher-patch` git history for precedent.

### 2c — Commit

```bash
git add patches/
git commit -m "Update patches for ${BETTER_SQLITE3_VERSION}-sqlcipher${SQLCIPHER_VERSION}-bearssl${BEARSSL_VERSION}"
```

---

## 3 — Apply to `better-sqlcipher`

**Repo:** `better-sqlcipher` (checked out next to `better-sqlcipher-patch`)

- [ ] Clone (first time) or ensure the repo is clean:

  ```bash
  git clone git@github.com:threema-ch/better-sqlcipher.git
  cd better-sqlcipher/
  git remote add upstream https://github.com/WiseLibs/better-sqlite3.git  # first time only
  ```

- [ ] Fetch upstream and create the release branch:

  ```bash
  git fetch upstream
  git checkout -b "${BETTER_SQLITE3_VERSION}-sqlcipher${SQLCIPHER_VERSION}-bearssl${BEARSSL_VERSION}" \
      "v${BETTER_SQLITE3_VERSION}"
  ```

- [ ] Apply patches:

  ```bash
  python ../better-sqlcipher-patch/apply-patches.py .
  ```

- [ ] Download / re-generate vendored deps:

  ```bash
  npm run download
  ```

- [ ] Smoke-test the build:

  ```bash
  npm run build-release
  npm test
  ```

- [ ] Commit:

  ```bash
  git add .
  git commit -m "Apply patches for SQLCipher ${SQLCIPHER_VERSION} / BearSSL ${BEARSSL_VERSION}"
  ```

- [ ] Push branch
