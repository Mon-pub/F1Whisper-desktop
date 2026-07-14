/**
 * Worker-only Node primitive for the sender-side link-preview fetcher.
 *
 * The fetcher in `~/common/dom/network/link-preview/fetcher` needs Node's `https` stack (NOT the
 * app's cert-pinned OnPrem client, and NOT Chromium's pinned network stack). It lives under
 * `common/dom`, whose tsconfig has NO node types and whose bundle is SHARED with the renderer static
 * graph, so it must NOT touch `node:*` itself. The fetcher receives `https.request` via
 * {@link LinkPreviewNodeApi} dependency injection. (Like Signal-Desktop, the fetch is a plain HTTPS
 * GET to the validated host — no DNS resolution / IP-pinning here.)
 *
 * Bundling constraints this module has to satisfy SIMULTANEOUSLY:
 *
 *  - The backend WORKER is built as a single-file IIFE (no code-splitting allowed), so a dynamic
 *    `import("node:https")` is mis-resolved to an empty `__viteBrowserExternal` stub (the export comes
 *    back `undefined` -> "t is not a function"), and a dynamic `import("~/...")` of a regular module
 *    fails the build ("IIFE is not supported for code-splitting"). So no dynamic imports.
 *  - A STATIC `import * as https from 'node:https'` is rewritten by the `commonjs-externals` Vite
 *    plugin to a TOP-LEVEL `const https = require("node:https")`. That works in the worker, but it is
 *    a retained module side effect: because `backend.ts` (which injects this api) sits in the
 *    renderer's static graph for type extraction, Rollup hoists that top-level `require` into the
 *    RENDERER bundle even after tree-shaking the unused binding -> `require is not defined` ->
 *    blank-white. So no top-level `node:*` import either.
 *
 * Resolution: access the builtin through a bare `require(...)` INSIDE the getter function. The
 * `commonjs-externals` plugin only rewrites `import` statements, so it leaves the bare `require`
 * untouched. In the WORKER (Node/CJS context) `require` exists and resolves the builtin. In the
 * RENDERER the getter is never called and contains no top-level side effect, so Rollup tree-shakes the
 * whole module away -> zero `require("node:...")` reaches the renderer bundle. `require` is typed
 * because this module lives under `common/node` (`types: ["node"]`).
 */
import type * as httpsModule from 'node:https';

/**
 * The minimal slice of Node's `https` API the link-preview fetcher depends on. Passed into the fetcher
 * so it has zero `node:*` imports of its own.
 */
export interface LinkPreviewNodeApi {
    /** `node:https`'s `request`. */
    readonly httpsRequest: typeof httpsModule.request;
}

/**
 * Build the real-Node {@link LinkPreviewNodeApi} from the runtime `node:*` builtin. ONLY ever called
 * in the backend worker (Node context). See the module header for why the builtin is loaded via a bare
 * in-function `require(...)` rather than a static or dynamic `import`.
 */
export function getLinkPreviewNodeApi(): LinkPreviewNodeApi {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('node:https') as typeof httpsModule;
    return {
        httpsRequest: https.request,
    };
}
