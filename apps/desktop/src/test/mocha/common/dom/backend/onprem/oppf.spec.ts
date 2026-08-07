import {expect} from 'chai';

import {ensureEd25519PublicKey} from '~/common/crypto';
import {
    classifyOppfVerificationError,
    decideCachedOppfUsage,
    OPPF_ANCHOR_REFRESH_INTERVAL_MS,
    OPPF_EXPIRED_OFFLINE_GRACE_MS,
    OPPF_FILE_SCHEMA,
    OPPF_STALE_OFFLINE_MAX_MS,
    shouldRefreshOppfStalenessAnchor,
    verifyOppfFile,
} from '~/common/dom/backend/onprem/oppf';
import {CryptoError} from '~/common/error';
import {base64ToU8a} from '~/common/utils/base64';
import {UTF8} from '~/common/utils/codec';
import {TestTweetNaClBackend} from '~/test/mocha/common/backend-mocks';
import {
    LICENSE_EXPIRED_STRING,
    MOCK_OPPF,
    WRONG_OPPF_SIGNATURE_STRING,
} from '~/test/mocha/common/onprem/oppf-mock';

/** Run `fn`, returning whatever it throws. Fails the test if `fn` does not throw. */
function catchThrown(fn: () => void): unknown {
    try {
        fn();
    } catch (error) {
        return error;
    }
    throw new Error('Expected fn to throw');
}

/**
 * Tests for the cached-OPPF temporal-validation decision (P-H07).
 */
export function run(): void {
    describe('decideCachedOppfUsage (P-H07 cached-OPPF temporal validation)', function () {
        const HOUR_MS = 60 * 60 * 1000;
        const DAY_MS = 24 * HOUR_MS;
        const now = 1_000_000_000_000;
        // 1-day cadence -> staleness bound clamps to 1 day.
        const refreshSeconds = 24 * 60 * 60;

        it('uses a fresh, unexpired cache directly (skip; background refresh)', function () {
            const decision = decideCachedOppfUsage(
                {expiresMs: now + 30 * DAY_MS, lastUpdatedMs: now - HOUR_MS, refreshSeconds},
                now,
            );
            expect(decision.refresh).to.equal('skip');
            expect(decision.offlineFallback).to.equal('use-cache');
        });

        it('prefers a synchronous refresh for a valid-but-stale cache, still usable offline', function () {
            const decision = decideCachedOppfUsage(
                {expiresMs: now + 30 * DAY_MS, lastUpdatedMs: now - 5 * DAY_MS, refreshSeconds},
                now,
            );
            expect(decision.refresh).to.equal('preferred');
            expect(decision.offlineFallback).to.equal('use-cache');
        });

        it('requires a synchronous refresh for an expired cache within the offline grace', function () {
            const decision = decideCachedOppfUsage(
                {expiresMs: now - DAY_MS, lastUpdatedMs: now - 2 * DAY_MS, refreshSeconds},
                now,
            );
            expect(decision.refresh).to.equal('required');
            expect(
                decision.offlineFallback,
                'expired-but-within-grace stays usable offline',
            ).to.equal('use-cache');
        });

        it('forbids the cache when expired beyond the offline grace (must fail if offline)', function () {
            const decision = decideCachedOppfUsage(
                {
                    expiresMs: now - OPPF_EXPIRED_OFFLINE_GRACE_MS - DAY_MS,
                    lastUpdatedMs: now - 40 * DAY_MS,
                    refreshSeconds,
                },
                now,
            );
            expect(decision.refresh).to.equal('required');
            expect(decision.offlineFallback).to.equal('fail');
        });

        it('treats the exact expiry instant as valid and one millisecond past as expired', function () {
            const atBoundary = decideCachedOppfUsage(
                {expiresMs: now, lastUpdatedMs: now - HOUR_MS, refreshSeconds},
                now,
            );
            expect(atBoundary.refresh, 'now == expires is not yet expired').to.equal('skip');

            const justPast = decideCachedOppfUsage(
                {expiresMs: now - 1, lastUpdatedMs: now - HOUR_MS, refreshSeconds},
                now,
            );
            expect(justPast.refresh, 'now > expires is expired').to.equal('required');
        });

        it('caps the valid-but-stale offline fallback (FIX-2): unreachable host cannot keep a stale cache alive forever', function () {
            // Stale but within the offline cap: still usable offline.
            const withinCap = decideCachedOppfUsage(
                {
                    expiresMs: now + 365 * DAY_MS,
                    lastUpdatedMs: now - (OPPF_STALE_OFFLINE_MAX_MS - DAY_MS),
                    refreshSeconds,
                },
                now,
            );
            expect(withinCap.refresh).to.equal('preferred');
            expect(withinCap.offlineFallback, 'within the cap stays usable offline').to.equal(
                'use-cache',
            );

            // Stale beyond the offline cap (but license still valid): must fail rather than keep a
            // possibly-revoked signer alive while the host is network-blocked.
            const beyondCap = decideCachedOppfUsage(
                {
                    expiresMs: now + 365 * DAY_MS,
                    lastUpdatedMs: now - (OPPF_STALE_OFFLINE_MAX_MS + DAY_MS),
                    refreshSeconds,
                },
                now,
            );
            expect(beyondCap.refresh).to.equal('preferred');
            expect(beyondCap.offlineFallback, 'beyond the cap must fail if offline').to.equal(
                'fail',
            );
        });
    });

    describe('shouldRefreshOppfStalenessAnchor (P-H07 FIX-1 anchor advance)', function () {
        const MINUTE_MS = 60 * 1000;
        const now = 1_000_000_000_000;

        it('always re-persists when the fetched content changed', function () {
            expect(
                shouldRefreshOppfStalenessAnchor({
                    contentChanged: true,
                    cachedLastUpdatedMs: now - MINUTE_MS,
                    nowMs: now,
                }),
            ).to.be.true;
        });

        it('advances the anchor for unchanged content once it has aged past the interval', function () {
            expect(
                shouldRefreshOppfStalenessAnchor({
                    contentChanged: false,
                    cachedLastUpdatedMs: now - (OPPF_ANCHOR_REFRESH_INTERVAL_MS + MINUTE_MS),
                    nowMs: now,
                }),
                'aged anchor is refreshed',
            ).to.be.true;
        });

        it('skips re-persisting unchanged content while the anchor is still fresh (no Argon2 churn)', function () {
            expect(
                shouldRefreshOppfStalenessAnchor({
                    contentChanged: false,
                    cachedLastUpdatedMs: now - MINUTE_MS,
                    nowMs: now,
                }),
                'fresh anchor is not re-derived on every relaunch',
            ).to.be.false;
        });
    });

    describe('classifyOppfVerificationError (FU-M10 caller-facing check taxonomy)', function () {
        const crypto = new TestTweetNaClBackend();
        // The key `WRONG_OPPF_SIGNATURE_STRING` actually claims as its signer.
        const claimedSignerKey = 'VR4nTeVFeao9TcIJn5KaMsuW6Lc4gMC+j8z//zngvNs=';
        // The key `CORRECT_OPPF_STRING`/`LICENSE_EXPIRED_STRING` are actually signed with.
        const trustedKey = '1TrQLW5sipBuw2lcc3Y/gSUGHTzNHuLPN4X9M7Y82m8=';

        it('classifies an unknown signature key as untrusted-signer (end-to-end via verifyOppfFile)', function () {
            const error = catchThrown(() => {
                verifyOppfFile(
                    {crypto},
                    [ensureEd25519PublicKey(base64ToU8a(trustedKey))],
                    UTF8.encode(WRONG_OPPF_SIGNATURE_STRING),
                );
            });
            expect(classifyOppfVerificationError(error)).to.equal('untrusted-signer');
        });

        it('classifies a trusted-but-mismatched signature as invalid-signature (end-to-end via verifyOppfFile)', function () {
            const error = catchThrown(() => {
                verifyOppfFile(
                    {crypto},
                    [ensureEd25519PublicKey(base64ToU8a(claimedSignerKey))],
                    UTF8.encode(WRONG_OPPF_SIGNATURE_STRING),
                );
            });
            expect(
                error,
                'sanity-check the fixture actually exercises CryptoError',
            ).to.be.instanceOf(CryptoError);
            expect(classifyOppfVerificationError(error)).to.equal('invalid-signature');
        });

        it('classifies an expired license as expired (end-to-end via verifyOppfFile)', function () {
            const error = catchThrown(() => {
                verifyOppfFile(
                    {crypto},
                    [ensureEd25519PublicKey(base64ToU8a(trustedKey))],
                    UTF8.encode(LICENSE_EXPIRED_STRING),
                );
            });
            expect(classifyOppfVerificationError(error)).to.equal('expired');
        });

        it('classifies a schema-invalid OPPF (including a normalized impossible date) as malformed', function () {
            const error = catchThrown(() => {
                OPPF_FILE_SCHEMA.parse({
                    ...MOCK_OPPF,
                    license: {...MOCK_OPPF.license, expires: '2024-02-30'},
                });
            });
            expect(classifyOppfVerificationError(error)).to.equal('malformed');
        });

        it('classifies unparseable JSON as malformed (catch-all)', function () {
            const error = catchThrown(() => {
                JSON.parse('this is not json');
            });
            expect(classifyOppfVerificationError(error)).to.equal('malformed');
        });

        it('classifies a completely unrelated Error as malformed (catch-all, fail-closed)', function () {
            expect(classifyOppfVerificationError(new Error('boom, totally unrelated'))).to.equal(
                'malformed',
            );
        });

        it('classifies a non-Error thrown value as malformed (catch-all, fail-closed)', function () {
            expect(classifyOppfVerificationError('a plain string, not even an Error')).to.equal(
                'malformed',
            );
            expect(classifyOppfVerificationError(undefined)).to.equal('malformed');
        });
    });
}
