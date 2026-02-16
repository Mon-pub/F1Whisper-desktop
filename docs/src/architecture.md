# Architecture

This file documents some aspects of the structure and architecture of the Threema Desktop monorepo.
It is by no means complete, but should help with understanding and extending the codebase.

The project is structured as a monorepo based on [pnpm workspaces](https://pnpm.io/workspaces), and
uses [Turborepo](https://turborepo.dev) as the build system. The overall structure is as follows:

- `apps/`: Subprojects for individual products, such as the Threema Desktop Electron app.
  - `desktop/`: Threema Desktop application based on Electron.
- `packages/`: Subprojects for packages shared by multiple apps.

## Monorepo

The following sections outlines some of the decisions that were made in relation to the monorepo
structure.

### Pnpm

We use the [pnpm catalogs](https://pnpm.io/catalogs) feature to share package versions among
packages. This allows pinning of dependency versions in a centralized manner via
`pnpm-workspace.yaml`. The general rule is as follows:

- A dependency which is only used in a single package is added to the respective package's
  `package.json` directly. Example: Electron dependencies are pinned directly in
  `apps/desktop/package.json`, because there is only one Electron application in the entire project.
- A dependency which is used in multiple packages is pinned in `pnpm-workspace.yaml`, and then
  reused in the `package.json` of each respective subpackage which uses the dependency by specifying
  `"catalog:"` as the version. Example: `"eslint"`, because this dev dependency needs to be added to
  every linted package.

### Turborepo

At the top-level of the project, there's a main `turbo.jsonc` config file which defines the common
tasks used throughout the project. Individual packages may have their own `turbo.json` file, which
is used to override or extend individual tasks and task options for the respective package.

There are a few important behaviors to consider for Turborepo:

- Task options (e.g. `dependsOn`) for the same task that are defined in both the top-level and
  package-level Turbo config will not be merged! A package-level option always overrides the
  equivalent option inherited from the top-level Turbo config. For example, if the top-level Turbo
  config defines `dependsOn` for a task named `build`, defining `dependsOn` for the same task in
  `apps/desktop/turbo.json` will cause Turbo to only consider the dependencies defined in
  `apps/desktop/turbo.json` when building the `apps/desktop` package.
- We use Turborepo in strict mode, which means only whitelisted environment variables are passed to
  individual tasks. Therefore, each task needs to specify all environment variables it needs using
  the `env` option.
- Defining `env` in the top-level Turbo config is generally discouraged in this project, because it
  affects the task's build hash for all packages. Environment variables should usually be defined in
  the respective package-level Turbo config, and only for the respective tasks that need it.
