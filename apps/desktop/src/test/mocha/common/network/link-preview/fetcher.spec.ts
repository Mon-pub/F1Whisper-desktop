import {EventEmitter} from 'node:events';
import {get as httpsGet, request as httpsRequest} from 'node:https';

import {expect} from 'chai';

import {fetchRawPreview} from '~/common/dom/network/link-preview/fetcher';
import {NOOP_LOGGER} from '~/common/logging';
import type {LinkPreviewNodeApi} from '~/common/node/network/link-preview-node';

/**
 * Tests for the sender-side link-preview FETCHER (the network path), as opposed to the pure
 * parse/validator specs next door. Two layers:
 *
 *  1. Hermetic crash-proofing — the fetcher runs in the Electron backend WORKER, a hybrid context
 *     where `setTimeout` is the DOM global (returns a NUMBER, no `.unref()`). We simulate that and a
 *     Node-style request that re-throws an unhandled `'error'`, and assert the fetch always degrades
 *     to `undefined` without throwing or surfacing an uncaught exception.
 *  2. A REAL end-to-end fetch against a public site (self-skips when offline) — the actual `node:https`
 *     stack against a real Open Graph page. This is the test that catches "the mock passed but the
 *     real fetch returns nothing" class of bug (e.g. the old custom-`lookup` IP-pin silently failing).
 *
 * NB the target host MUST be one the SSRF validator allows (e.g. `signal.org`), otherwise the fetch
 * short-circuits BEFORE the network path and the test would never exercise it.
 */

/** A validator-allowed host so `fetchRawPreview` actually reaches the (faked) network path. */
const ALLOWED_URL = 'https://signal.org/';

/** A DOM-style `setTimeout` that returns a NUMBER (no `.unref()`), like the worker/browser global. */
interface InstalledWorkerTimers {
    readonly restore: () => void;
}
function installWorkerTimers(): InstalledWorkerTimers {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const handles = new Map<number, ReturnType<typeof setTimeout>>();
    let nextId = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setTimeout = (
        fn: (...a: unknown[]) => void,
        ms?: number,
        ...args: unknown[]
    ) => {
        const id = nextId++;
        const handle = realSetTimeout(
            () => {
                handles.delete(id);
                fn(...args);
            },
            Math.min(ms ?? 0, 10), // clamp so the response-timeout path fires fast in the test
        );
        handles.set(id, handle);
        return id; // a NUMBER, exactly like the DOM global (the crux: no `.unref()`)
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).clearTimeout = (id: unknown) => {
        if (typeof id === 'number') {
            const handle = handles.get(id);
            if (handle !== undefined) {
                realClearTimeout(handle);
                handles.delete(id);
            }
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        realClearTimeout(id as any);
    };
    return {
        restore: () => {
            globalThis.setTimeout = realSetTimeout;
            globalThis.clearTimeout = realClearTimeout;
        },
    };
}

type RequestBehavior =
    | {
          readonly kind: 'html';
          readonly statusCode: number;
          readonly body: string;
          readonly contentType: string;
      }
    | {readonly kind: 'never'}
    | {readonly kind: 'orphan-error'}; // emits 'error'; if no listener, re-throws like Node

type FakeResponse = EventEmitter & {
    statusCode?: number;
    headers: Record<string, string>;
    resume: () => void;
};

/** Minimal Node-style ClientRequest stub that faithfully re-throws an unhandled `'error'`. */
class FakeClientRequest extends EventEmitter {
    public destroyed = false;
    public constructor(
        private readonly _behavior: RequestBehavior,
        private readonly _onResponse: (response: FakeResponse) => void,
    ) {
        super();
        if (this._behavior.kind === 'orphan-error') {
            // A real socket connects on the next tick and may error; model that so it can race the
            // (synchronous) Promise executor — exactly how the original crash arose.
            queueMicrotask(() => {
                if (this.destroyed) {
                    return;
                }
                const error = new TypeError('socket error');
                if (this.listenerCount('error') > 0) {
                    this.emit('error', error);
                } else {
                    throw error; // Node re-throws an unhandled 'error' event -> uncaught exception.
                }
            });
        }
    }

    public end(): void {
        if (this._behavior.kind === 'html') {
            const {statusCode, body, contentType} = this._behavior;
            queueMicrotask(() => {
                if (this.destroyed) {
                    return;
                }
                const response: FakeResponse = Object.assign(new EventEmitter(), {
                    statusCode,
                    headers: {'content-type': contentType} as Record<string, string>,
                    resume: () => {},
                });
                this._onResponse(response);
                queueMicrotask(() => {
                    response.emit('data', new TextEncoder().encode(body));
                    response.emit('end');
                });
            });
        }
        // 'never' / 'orphan-error' intentionally never produce a response.
    }

    public destroy(): void {
        this.destroyed = true;
    }
}

function makeFakeNode(behavior: RequestBehavior): LinkPreviewNodeApi {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        httpsRequest: ((_options: any, onResponse: any) =>
            new FakeClientRequest(behavior, onResponse)) as never,
    };
}

/** Quick connectivity probe so the real-network test self-skips offline instead of failing. */
async function hasNetwork(): Promise<boolean> {
    return await new Promise((resolve) => {
        const req = httpsGet('https://www.wikipedia.org/', {timeout: 5000}, (res) => {
            res.resume();
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

export function run(): void {
    describe('link-preview fetcher (worker network path)', function () {
        let timers: InstalledWorkerTimers;
        let uncaught: unknown[];
        let originalUncaughtListeners: NodeJS.UncaughtExceptionListener[];

        beforeEach(function () {
            timers = installWorkerTimers();
            uncaught = [];
            originalUncaughtListeners = process.listeners('uncaughtException');
            process.removeAllListeners('uncaughtException');
            process.on('uncaughtException', (error) => {
                uncaught.push(error);
            });
        });

        afterEach(function () {
            timers.restore();
            process.removeAllListeners('uncaughtException');
            for (const listener of originalUncaughtListeners) {
                process.on('uncaughtException', listener);
            }
        });

        async function settle(): Promise<void> {
            await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
        }

        it('returns the parsed preview for a 200 OG-HTML response', async function () {
            const node = makeFakeNode({
                kind: 'html',
                statusCode: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<html><head><meta property="og:title" content="Example Title"><meta property="og:description" content="A description"></head></html>',
            });
            const result = await fetchRawPreview(ALLOWED_URL, node, NOOP_LOGGER);
            expect(result, 'a previewable page yields a result').to.not.equal(undefined);
            expect(result?.title).to.equal('Example Title');
            expect(result?.description).to.equal('A description');
            await settle();
            expect(uncaught, 'no uncaught exception').to.have.lengthOf(0);
        });

        it('does NOT crash when the worker setTimeout has no unref and the request errors', async function () {
            // Regression guard: DOM setTimeout (number, no .unref()) + a request whose socket errors.
            // The error handler must be attached so Node never re-throws it as an uncaught exception.
            const node = makeFakeNode({kind: 'orphan-error'});
            const result = await fetchRawPreview(ALLOWED_URL, node, NOOP_LOGGER);
            expect(result, 'a failed fetch degrades to undefined').to.equal(undefined);
            await settle();
            expect(uncaught, 'the socket error must be handled, not uncaught').to.have.lengthOf(0);
        });

        it('degrades to undefined (no hang, no crash) when the response never arrives', async function () {
            const node = makeFakeNode({kind: 'never'});
            const result = await fetchRawPreview(ALLOWED_URL, node, NOOP_LOGGER);
            expect(result, 'the response-timeout ceiling resolves to undefined').to.equal(undefined);
            await settle();
            expect(uncaught).to.have.lengthOf(0);
        });

        it('never reaches the network for a URL the SSRF validator rejects', async function () {
            let touched = false;
            const node: LinkPreviewNodeApi = {
                httpsRequest: (() => {
                    touched = true;
                    throw new Error('must not be called');
                }) as never,
            };
            // Loopback is blocked by the validator -> fetch returns undefined before any network use.
            const result = await fetchRawPreview('https://127.0.0.1/', node, NOOP_LOGGER);
            expect(result).to.equal(undefined);
            expect(touched, 'a blocked URL must not touch the socket').to.equal(false);
        });

        // REAL end-to-end fetch against a public Open Graph page using the actual node:https stack.
        // Self-skips when offline. This is the test that proves the fetch genuinely returns a preview
        // (and would have caught the silent custom-`lookup` IP-pin failure).
        it('REAL: fetches a live Open Graph preview end-to-end', async function () {
            this.timeout(30000);
            timers.restore(); // use real timers for the real network round-trip
            if (!(await hasNetwork())) {
                this.skip();
                return;
            }
            const realNode: LinkPreviewNodeApi = {httpsRequest};
            // github.com serves stable og:title/og:image and passes the SSRF validator.
            const result = await fetchRawPreview('https://github.com/', realNode, NOOP_LOGGER);
            expect(result, 'a real public page must yield a preview').to.not.equal(undefined);
            expect(result?.title ?? '', 'a real og:title/title is parsed').to.not.equal('');
        });
    });
}
