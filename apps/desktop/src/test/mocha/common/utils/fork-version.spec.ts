import * as chai from 'chai';

import {
    determineForkVersion,
    determineForkVersionCode,
    determineMsixVersion,
    determinePackagerVersions,
    FORK_RELEASE_CODE_STRIDE,
} from '../../../../../config/base';

const {expect} = chai;

/**
 * Current build identity (vite-defined constants, not process environment, so the turbo rule's
 * env-var list does not apply).
 */
/* eslint-disable turbo/no-undeclared-env-vars */
const BUILD_VERSION = import.meta.env.BUILD_VERSION;
const BUILD_FORK_VERSION = import.meta.env.BUILD_FORK_VERSION;
const BUILD_VERSION_CODE = import.meta.env.BUILD_VERSION_CODE;
const F1_RELEASE = import.meta.env.F1_RELEASE;
/* eslint-enable turbo/no-undeclared-env-vars */

/**
 * Update-ordering / release-identity regression test (FU-H10). The canonical fork version helpers
 * must order same-upstream fork releases monotonically for update selection and MSIX upgrades, so a
 * newer fork release of an unchanged upstream version is never mistaken for the same or an older one.
 */
export function run(): void {
    describe('release::fork-version', function () {
        it('composes the canonical fork identity string', function () {
            expect(determineForkVersion('2.0-beta61', 3)).to.equal('2.0-beta61-f1.3');
        });

        it('fork version code strictly increases across fork releases of the same upstream version', function () {
            expect(determineForkVersionCode(63, 1)).to.be.lessThan(determineForkVersionCode(63, 2));
            expect(determineForkVersionCode(63, 2)).to.be.lessThan(determineForkVersionCode(63, 3));
            expect(determineForkVersionCode(63, 3)).to.be.lessThan(determineForkVersionCode(63, 4));
        });

        it('an upstream version-code bump dominates the fork release counter', function () {
            // The highest fork release of an older upstream stays below the first release of a newer
            // upstream version.
            expect(determineForkVersionCode(64, 0)).to.be.greaterThan(
                determineForkVersionCode(63, FORK_RELEASE_CODE_STRIDE - 1),
            );
        });

        it('the new fork code exceeds the legacy raw version code of the previously published release', function () {
            // The last published build baked the raw versionCode (63) for f1.2; f1.3 must still be
            // ordered as newer so an installed f1.2 offers the update.
            const legacyPublishedRawVersionCode = 63;
            expect(determineForkVersionCode(63, 3)).to.be.greaterThan(
                legacyPublishedRawVersionCode,
            );
        });

        it('the current build metadata composes the canonical fork identity', function () {
            expect(BUILD_FORK_VERSION).to.equal(determineForkVersion(BUILD_VERSION, F1_RELEASE));
            expect(BUILD_FORK_VERSION).to.match(/-f1\.[0-9]+$/u);
            expect(BUILD_FORK_VERSION.endsWith(`-f1.${F1_RELEASE}`)).to.equal(true);
        });

        it('the current build version code is above the legacy and the f1.3 published codes', function () {
            const legacyPublishedRawVersionCode = 63;
            expect(BUILD_VERSION_CODE).to.be.greaterThan(legacyPublishedRawVersionCode);
            // Release f1.3 was published at upstream version code 63.
            expect(BUILD_VERSION_CODE).to.be.greaterThan(determineForkVersionCode(63, 3));
            // The fork release counter is the low part of the code.
            expect(BUILD_VERSION_CODE % FORK_RELEASE_CODE_STRIDE).to.equal(F1_RELEASE);
        });

        it('builds a monotonic AppX version within segment bounds', function () {
            expect(determineMsixVersion('2.0-beta61', 63, 3)).to.equal('2.0.63.3');
            // Revision segment orders fork releases of the same upstream version.
            expect(determineMsixVersion('2.0-beta61', 63, 3)).to.not.equal(
                determineMsixVersion('2.0-beta61', 63, 2),
            );
            // Every AppX version segment must fit the 0-65535 limit Windows enforces.
            for (const segment of determineMsixVersion('2.0-beta61', 63, 3).split('.')) {
                expect(Number(segment), `segment ${segment} within AppX bounds`).to.be.at.most(
                    65535,
                );
            }
        });

        it('uses the canonical fork identity and a numeric Windows Packager build version', function () {
            const versions = determinePackagerVersions('2.0-beta61', 63, 3);
            expect(versions).to.deep.equal({
                appVersion: '2.0-beta61-f1.3',
                windowsBuildVersion: '2.0.63.3',
            });
            expect(versions.windowsBuildVersion).to.match(/^\d+\.\d+\.\d+\.\d+$/u);
        });
    });
}
