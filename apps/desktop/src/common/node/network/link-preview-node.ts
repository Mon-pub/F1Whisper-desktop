/**
 * Worker-only Node primitives for the sender-side link-preview fetcher.
 *
 * The fetcher in `~/common/dom/network/link-preview/fetcher` needs Node's `https`/`dns` stacks (NOT
 * the app's cert-pinned OnPrem client, and NOT Chromium's pinned network stack). It lives under
 * `common/dom`, whose tsconfig has NO node types and whose bundle is SHARED with the renderer static
 * graph, so it must NOT touch `node:*` itself. The fetcher receives `https.request` PLUS a hostname
 * resolver via {@link LinkPreviewNodeApi} dependency injection. The resolver exists so the fetcher can
 * resolve every A/AAAA answer for a host, reject any that are private/loopback/link-local/etc., and
 * PIN the actual socket connection to one of the vetted addresses (via `https.request`'s `lookup`
 * option), closing the DNS-rebinding gap where a hostname that looked public at validation time
 * resolves to an internal address at connect time.
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
 * untouched. In the WORKER (Node/CJS context) `require` exists and resolves the builtin.
 *
 * This module is imported by exactly one caller, `getLinkPreviewNodeApi` in
 * `~/common/dom/network/link-preview/backend` (`LinkPreviewBackendImpl`, worker-only). "The getter is
 * never called in the renderer" is NOT by itself enough to keep this text out of the renderer bundle:
 * Rollup decides which CHUNK a module's compiled output lands in based on the import graph, not on
 * whether a specific call site executes at runtime, so if ANY renderer-reachable code held a runtime
 * (non-type) import of anything from `backend.ts`'s file, `common/dom/backend/index.ts`, Rollup could
 * still fold that whole worker-only module, including this file's `require("node:...")` calls, into a
 * chunk the renderer loads (a ship-gate violation caught once already: `BackendCreationError` used to
 * live in that same file and was imported by value from the renderer's `BackendController`, in
 * `common/dom/backend/controller.ts`). `BackendCreationError` now lives in its own dependency-light
 * module, `~/common/dom/backend/errors`, imported directly by every renderer-reachable consumer, so
 * `common/dom/backend/index.ts` has no runtime importer left outside the backend worker chain. Do NOT
 * add a runtime (non-`import type`) import of `~/common/dom/backend` from renderer-reachable code
 * without re-verifying the renderer `require("node:` ship-gate scan stays at zero. `require` is typed
 * because this module lives under `common/node` (`types: ["node"]`).
 */
import type * as dnsModule from 'node:dns';
import type * as httpsModule from 'node:https';

/** One resolved DNS answer, narrowed to the two families the SSRF policy classifies. */
export interface ResolvedPreviewAddress {
    readonly address: string;
    readonly family: 4 | 6;
}

/**
 * The minimal slice of Node's `https`/`dns` API the link-preview fetcher depends on. Passed into the
 * fetcher so it has zero `node:*` value imports of its own.
 */
export interface LinkPreviewNodeApi {
    /** `node:https`'s `request`. */
    readonly httpsRequest: typeof httpsModule.request;
    /**
     * Resolve EVERY A/AAAA answer for `hostname` via the OS resolver (`dns.lookup`, `{all: true}`,
     * the same resolution a normal unmodified connection would use, including `/etc/hosts` and OS DNS
     * config). The fetcher runs every answer through `isBlockedIpAddress` and pins the connection to
     * one of the surviving addresses, so this is resolved ONCE and reused for both the policy check
     * and the actual connect; there is no separate later re-resolution for an attacker to rebind.
     * Rejects if the hostname cannot be resolved at all.
     */
    readonly resolveHostAddresses: (hostname: string) => Promise<readonly ResolvedPreviewAddress[]>;
}

/**
 * Build the real-Node {@link LinkPreviewNodeApi} from the runtime `node:*` builtins. ONLY ever called
 * in the backend worker (Node context). See the module header for why the builtins are loaded via a
 * bare in-function `require(...)` rather than a static or dynamic `import`.
 */
export function getLinkPreviewNodeApi(): LinkPreviewNodeApi {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('node:https') as typeof httpsModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dns = require('node:dns') as typeof dnsModule;
    return {
        httpsRequest: https.request,
        resolveHostAddresses: async (hostname) =>
            await new Promise<readonly ResolvedPreviewAddress[]>((resolve, reject) => {
                dns.lookup(
                    hostname,
                    // `verbatim: true` per Node's own guidance: an explicit, version-stable answer
                    // order instead of relying on the (historically shifting) default reordering.
                    {all: true, verbatim: true},
                    (error, addresses) => {
                        if (error !== null) {
                            reject(error);
                            return;
                        }
                        resolve(
                            addresses
                                .filter(
                                    (candidate) => candidate.family === 4 || candidate.family === 6,
                                )
                                .map(
                                    (candidate): ResolvedPreviewAddress => ({
                                        address: candidate.address,
                                        family: candidate.family as 4 | 6,
                                    }),
                                ),
                        );
                    },
                );
            }),
    };
}
