import * as chai from 'chai';

import {
    BUILD_FLAVORS,
    canonicalizePackagedDirName,
    determineAppName,
    determinePackagedDirName,
} from '../../../../../config/base';

const {expect} = chai;

/**
 * Regression test for the shared packaged-output-directory naming (P-H09). The packager (producer)
 * and the installer/Flatpak packaging (consumers) must agree on the exact on-disk directory name,
 * otherwise a later packaging stage fails to find the directory `dist` produced.
 */
export function run(): void {
    describe('packaging::packaged-dir-name', function () {
        const platforms = ['linux', 'win32', 'darwin'] as const;
        const arches = ['x64', 'arm64'] as const;
        const baseAppName = 'F1Whisper';

        it('consumer path calc resolves the exact directory the producer emits, for every flavor/platform/arch', function () {
            for (const flavor of BUILD_FLAVORS) {
                for (const platform of platforms) {
                    for (const arch of arches) {
                        // `@electron/packager` emits `<appName>-<platform>-<arch>` (the app name may
                        // contain spaces), then `dist` renames it via `canonicalizePackagedDirName`.
                        const rawProducedDir = `${determineAppName(
                            flavor,
                            baseAppName,
                        )}-${platform}-${arch}`;
                        const producerFinalDir = canonicalizePackagedDirName(rawProducedDir);

                        // The installer/Flatpak consumers recompute the directory independently.
                        const consumerExpectedDir = determinePackagedDirName(
                            flavor,
                            baseAppName,
                            platform,
                            arch,
                        );

                        expect(consumerExpectedDir, `${flavor}/${platform}/${arch}`).to.equal(
                            producerFinalDir,
                        );
                        expect(consumerExpectedDir, 'must be space-free').to.not.match(/\s/u);
                    }
                }
            }
        });

        it('produces the space-free directory the release CI expects for the custom-onprem Linux build', function () {
            expect(determinePackagedDirName('custom-onprem', baseAppName, 'linux', 'x64')).to.equal(
                'F1Whisper-Beta-linux-x64',
            );
        });

        it('canonicalizePackagedDirName collapses spaces to hyphens and is idempotent', function () {
            expect(canonicalizePackagedDirName('F1Whisper Beta-linux-x64')).to.equal(
                'F1Whisper-Beta-linux-x64',
            );
            const once = canonicalizePackagedDirName('Threema OnPrem Beta-linux-x64');
            expect(canonicalizePackagedDirName(once), 'idempotent').to.equal(once);
        });
    });
}
