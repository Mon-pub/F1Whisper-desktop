# Architecture

This file documents some aspects of the structure and architecture of the Threema Desktop monorepo.
It is by no means complete, but should help with understanding and extending the codebase.

The project is structured as a monorepo based on [pnpm workspaces](https://pnpm.io/workspaces), and
uses [Turborepo](https://turborepo.dev) as the build system. The overall structure is as follows:

- `apps/`: Subprojects for individual products, such as the Threema Desktop Electron app.
  - `desktop/`: Threema Desktop application based on Electron.
- `packages/`: Subprojects for packages shared by multiple apps.
