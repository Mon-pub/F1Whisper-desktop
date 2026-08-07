import {EventEmitter} from 'node:events';
import type {LookupFunction} from 'node:net';

import {expect} from 'chai';

import {
    fetchRawPreview,
    pinnedLookup,
    resolveAllowedAddresses,
} from '~/common/dom/network/link-preview/fetcher';
import {NOOP_LOGGER} from '~/common/logging';
import type {
    LinkPreviewNodeApi,
    ResolvedPreviewAddress,
} from '~/common/node/network/link-preview-node';

/**
 * P-H02 regression suite: `validator.ts` documents resolved-address pinning that `fetcher.ts` used to
 * never perform (a hostname could look public in the string-level gate yet resolve to an internal
 * address at connect time, classic DNS-rebinding SSRF). These tests inject fabricated DNS answers
 * covering every range the fork-review fixture set requires, and prove that:
 *
 *  1. A hostname that resolves ONLY to blocked addresses never reaches `httpsRequest` at all (no
 *     socket attempt is even made).
 *  2. A hostname with a MIXED public/private answer set is pinned to an allowed address only; the
 *     private answer is never handed to the socket, in either the single-address or `all: true` form
 *     of Node's `lookup` option.
 *  3. Every redirect hop is independently re-resolved and re-checked (an allowed first hop redirecting
 *     to a privately-resolving second hop fails the whole fetch, and the second hop's socket is never
 *     attempted).
 *  4. A "rebinding" DNS server (a different, more dangerous answer on a later query) cannot affect an
 *     in-flight fetch: resolution happens exactly ONCE per hop and the connection is pinned to that
 *     single result; there is no separate "validate" query and "connect" query to desynchronise.
 *
 * No real network I/O happens anywhere in this file; `resolveHostAddresses` and `httpsRequest` are
 * both fully faked, and DNS answers are injected as plain data.
 */

// Real, well-known public IPs (never dialed here, only classified) so fixtures read naturally.
const PUBLIC_V4: ResolvedPreviewAddress = {address: '93.184.216.34', family: 4};
const PUBLIC_V6: ResolvedPreviewAddress = {address: '2606:2800:220:1:248:1893:25c8:1946', family: 6};

/** Fictitious hostnames used only as map keys / URL authorities; never resolved for real. */
const HOST_ALLOWED = 'www.previewfixture.dev';
const HOST_BLOCKED_ONLY = 'blocked-only.previewfixture.dev';
const HOST_MIXED = 'mixed.previewfixture.dev';
const HOST_REDIRECT_TARGET = 'internal.previewfixture.dev';
const HOST_REBIND = 'rebind.previewfixture.dev';

function fakeNodeWithResolver(
    resolveHostAddresses: (hostname: string) => Promise<readonly ResolvedPreviewAddress[]>,
): LinkPreviewNodeApi {
    return {
        httpsRequest: (() => {
            throw new Error('httpsRequest must not be constructed by resolveAllowedAddresses tests');
        }) as never,
        resolveHostAddresses,
    };
}

export function run(): void {
    describe('link-preview DNS-resolution SSRF pinning (P-H02)', function () {
        describe('resolveAllowedAddresses (per-hop DNS answer filter)', function () {
            const blockedFixtures: readonly [string, ResolvedPreviewAddress][] = [
                ['loopback IPv4', {address: '127.0.0.1', family: 4}],
                ['loopback IPv6', {address: '::1', family: 6}],
                ['RFC1918 10/8', {address: '10.1.2.3', family: 4}],
                ['RFC1918 172.16/12', {address: '172.16.5.5', family: 4}],
                ['RFC1918 192.168/16', {address: '192.168.1.1', family: 4}],
                ['link-local / cloud metadata', {address: '169.254.169.254', family: 4}],
                ['ULA fc00::/7', {address: 'fd12:3456:789a::1', family: 6}],
                ['CGNAT 100.64/10', {address: '100.64.0.1', family: 4}],
            ];
            for (const [label, address] of blockedFixtures) {
                it(`rejects a host that resolves only to a blocked address (${label})`, async function () {
                    const node = fakeNodeWithResolver(async () => await Promise.resolve([address]));
                    const result = await resolveAllowedAddresses('irrelevant.host', node, NOOP_LOGGER);
                    expect(result, `${label} must be rejected outright`).to.equal(undefined);
                });
            }

            it('keeps only the allowed subset for a mixed public+private answer set', async function () {
                const node = fakeNodeWithResolver(
                    async () =>
                        await Promise.resolve([
                            PUBLIC_V4,
                            {address: '127.0.0.1', family: 4},
                            {address: '10.0.0.9', family: 4},
                        ]),
                );
                const result = await resolveAllowedAddresses('irrelevant.host', node, NOOP_LOGGER);
                expect(result?.map((candidate) => candidate.address)).to.deep.equal([
                    PUBLIC_V4.address,
                ]);
            });

            it('accepts a purely public dual-stack answer unchanged', async function () {
                const node = fakeNodeWithResolver(
                    async () => await Promise.resolve([PUBLIC_V4, PUBLIC_V6]),
                );
                const result = await resolveAllowedAddresses('irrelevant.host', node, NOOP_LOGGER);
                expect(result?.map((candidate) => candidate.address)).to.deep.equal([
                    PUBLIC_V4.address,
                    PUBLIC_V6.address,
                ]);
            });

            it('rejects when DNS resolution itself fails', async function () {
                const node = fakeNodeWithResolver(
                    async () =>
                        await Promise.reject(
                            Object.assign(new Error('queryA ENOTFOUND'), {code: 'ENOTFOUND'}),
                        ),
                );
                const result = await resolveAllowedAddresses('irrelevant.host', node, NOOP_LOGGER);
                expect(result).to.equal(undefined);
            });
        });

        describe('pinnedLookup (the actual Node `lookup` option enforcement point)', function () {
            const allowed: readonly ResolvedPreviewAddress[] = [PUBLIC_V4, PUBLIC_V6];

            it('answers the single-address form with an allowed candidate only', async function () {
                const lookup: LookupFunction = pinnedLookup(allowed);
                await new Promise<void>((resolve) => {
                    lookup('irrelevant.host', {}, (error, address, family) => {
                        expect(error).to.equal(null);
                        expect(address).to.equal(PUBLIC_V4.address);
                        expect(family).to.equal(4);
                        resolve();
                    });
                });
            });

            it('honors a requested family among the allowed candidates', async function () {
                const lookup: LookupFunction = pinnedLookup(allowed);
                await new Promise<void>((resolve) => {
                    lookup('irrelevant.host', {family: 6}, (error, address, family) => {
                        expect(error).to.equal(null);
                        expect(address).to.equal(PUBLIC_V6.address);
                        expect(family).to.equal(6);
                        resolve();
                    });
                });
            });

            it('answers the `all: true` form with only allowed candidates', async function () {
                const lookup: LookupFunction = pinnedLookup(allowed);
                await new Promise<void>((resolve) => {
                    lookup('irrelevant.host', {all: true}, (error, addresses) => {
                        expect(error).to.equal(null);
                        const list = addresses as {readonly address: string}[];
                        expect(list.map((candidate) => candidate.address)).to.deep.equal([
                            PUBLIC_V4.address,
                            PUBLIC_V6.address,
                        ]);
                        resolve();
                    });
                });
            });
        });

        describe('fetchRawPreview end-to-end: no socket opens to a blocked address', function () {
            /** Minimal fake Node ClientRequest/response cycle; always answers 200 OK unless noted. */
            interface FakeHop {
                readonly statusCode: number;
                readonly headers?: Record<string, string>;
                readonly body?: string;
            }
            type FakeResponse = EventEmitter & {
                statusCode?: number;
                headers: Record<string, string>;
                resume: () => void;
            };
            class FakeRequest extends EventEmitter {
                public destroyed = false;
                public constructor(
                    private readonly _hop: FakeHop,
                    private readonly _onResponse: (response: FakeResponse) => void,
                ) {
                    super();
                }
                public end(): void {
                    const {
                        statusCode,
                        headers = {},
                        body = '<html><head><meta property="og:title" content="Fixture"></head></html>',
                    } = this._hop;
                    queueMicrotask(() => {
                        if (this.destroyed) {
                            return;
                        }
                        const response: FakeResponse = Object.assign(new EventEmitter(), {
                            statusCode,
                            headers: {'content-type': 'text/html; charset=utf-8', ...headers},
                            resume: () => {},
                        });
                        this._onResponse(response);
                        queueMicrotask(() => {
                            response.emit('data', new TextEncoder().encode(body));
                            response.emit('end');
                        });
                    });
                }
                public destroy(): void {
                    this.destroyed = true;
                }
            }

            interface CapturedCall {
                readonly hostname: string;
                readonly lookup: LookupFunction | undefined;
            }

            /** Builds a fake node where each `httpsRequest` call is answered from `hopsByHost`. */
            function makeFakeNode(
                hopsByHost: Readonly<Record<string, FakeHop>>,
                resolveHostAddresses: (
                    hostname: string,
                ) => Promise<readonly ResolvedPreviewAddress[]>,
                calls: CapturedCall[],
            ): LinkPreviewNodeApi {
                return {
                    httpsRequest: ((
                        options: {hostname: string; lookup?: LookupFunction},
                        onResponse: (r: FakeResponse) => void,
                    ) => {
                        calls.push({hostname: options.hostname, lookup: options.lookup});
                        const hop = hopsByHost[options.hostname];
                        if (hop === undefined) {
                            throw new Error(
                                `test bug: no fixture hop configured for host ${options.hostname}`,
                            );
                        }
                        return new FakeRequest(hop, onResponse);
                    }) as never,
                    resolveHostAddresses,
                };
            }

            it('never calls httpsRequest when the host resolves only to blocked addresses', async function () {
                const calls: CapturedCall[] = [];
                const node = makeFakeNode(
                    {},
                    async () => await Promise.resolve([{address: '127.0.0.1', family: 4}]),
                    calls,
                );
                const result = await fetchRawPreview(
                    `https://${HOST_BLOCKED_ONLY}/`,
                    node,
                    NOOP_LOGGER,
                );
                expect(result, 'a wholly-blocked resolution must not yield a preview').to.equal(
                    undefined,
                );
                expect(calls, 'no socket attempt may be made for a blocked-only resolution').to.have
                    .lengthOf(0);
            });

            it('pins the connection to the allowed address from a mixed public+private answer', async function () {
                const calls: CapturedCall[] = [];
                const node = makeFakeNode(
                    {[HOST_MIXED]: {statusCode: 200}},
                    async () => await Promise.resolve([PUBLIC_V4, {address: '10.9.9.9', family: 4}]),
                    calls,
                );
                const result = await fetchRawPreview(`https://${HOST_MIXED}/`, node, NOOP_LOGGER);
                expect(result, 'the allowed address is used and the fetch proceeds').to.not.equal(
                    undefined,
                );
                expect(calls).to.have.lengthOf(1);
                const {lookup} = calls[0] ?? {};
                expect(lookup, 'the request must carry a pinned lookup').to.not.equal(undefined);
                await new Promise<void>((resolve) => {
                    lookup?.(HOST_MIXED, {}, (error, address) => {
                        expect(error).to.equal(null);
                        expect(
                            address,
                            'the pinned lookup must never hand back the private answer',
                        ).to.equal(PUBLIC_V4.address);
                        resolve();
                    });
                });
                await new Promise<void>((resolve) => {
                    lookup?.(HOST_MIXED, {all: true}, (error, addresses) => {
                        expect(error).to.equal(null);
                        const list = addresses as {readonly address: string}[];
                        expect(
                            list.map((candidate) => candidate.address),
                            'the all:true form must also exclude the private answer',
                        ).to.deep.equal([PUBLIC_V4.address]);
                        resolve();
                    });
                });
            });

            it('re-validates DNS on every redirect hop: a privately-resolving redirect target aborts the fetch', async function () {
                const calls: CapturedCall[] = [];
                const node = makeFakeNode(
                    {
                        [HOST_ALLOWED]: {
                            statusCode: 302,
                            headers: {location: `https://${HOST_REDIRECT_TARGET}/`},
                        },
                        // No hop configured for HOST_REDIRECT_TARGET: if httpsRequest were ever called
                        // for it, the fixture would throw, proving the second hop's socket is never
                        // attempted because its DNS resolution is rejected first.
                    },
                    async (hostname) => {
                        if (hostname === HOST_ALLOWED) {
                            return await Promise.resolve([PUBLIC_V4]);
                        }
                        // The redirect target looks like a normal public hostname in the URL string
                        // gate, but resolves ONLY to an internal address, the exact P-H02 scenario.
                        return await Promise.resolve([{address: '172.16.0.1', family: 4}]);
                    },
                    calls,
                );
                const result = await fetchRawPreview(`https://${HOST_ALLOWED}/`, node, NOOP_LOGGER);
                expect(
                    result,
                    'a redirect to a privately-resolving host must fail the whole fetch',
                ).to.equal(undefined);
                expect(
                    calls.map((call) => call.hostname),
                    'only the first hop may reach httpsRequest; the second hop is rejected before any socket use',
                ).to.deep.equal([HOST_ALLOWED]);
            });

            it('rebinding sequence: a resolver that answers differently on a later query cannot affect an in-flight fetch', async function () {
                const calls: CapturedCall[] = [];
                let resolveCallCount = 0;
                const node = makeFakeNode(
                    {[HOST_REBIND]: {statusCode: 200}},
                    async () => {
                        resolveCallCount += 1;
                        // First (and, for this single-hop fetch, ONLY) query returns a public address.
                        // A hypothetical later query for the same host would return a private one,
                        // a classic near-zero-TTL DNS-rebinding attempt.
                        if (resolveCallCount === 1) {
                            return await Promise.resolve([PUBLIC_V4]);
                        }
                        return await Promise.resolve([{address: '127.0.0.1', family: 4}]);
                    },
                    calls,
                );
                const result = await fetchRawPreview(`https://${HOST_REBIND}/`, node, NOOP_LOGGER);
                expect(result, 'the fetch proceeds using the single, first resolution').to.not.equal(
                    undefined,
                );
                expect(
                    resolveCallCount,
                    'DNS must be resolved exactly once for a single-hop fetch; there is no separate validate-then-connect query for an attacker to rebind between',
                ).to.equal(1);
                const {lookup} = calls[0] ?? {};
                await new Promise<void>((resolve) => {
                    lookup?.(HOST_REBIND, {}, (error, address) => {
                        expect(error).to.equal(null);
                        expect(
                            address,
                            'the pinned connection must use the address from the single resolution already performed, never a later/different answer',
                        ).to.equal(PUBLIC_V4.address);
                        resolve();
                    });
                });
            });
        });
    });
}
