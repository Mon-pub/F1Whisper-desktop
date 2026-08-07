import {expect} from 'chai';
import {stub} from 'sinon';

import type {FactoriesForBackend} from '~/common/dom/backend';
import {
    OldProfileRestorationUnavailableError,
    unlockDatabaseKey,
} from '~/common/dom/backend/restore-db';
import type {KeyStorage, ServicesForKeyStorage} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import {NOOP_LOGGER} from '~/common/logging';

export function run(): void {
    describe('old-profile database-key unlock classification', function () {
        const services = {} as ServicesForKeyStorage;

        async function unlockWith(error: KeyStorageError): Promise<void> {
            const keyStorage = {
                readForRestoration: stub().rejects(error),
            } as unknown as KeyStorage;
            const factories = {
                keyStorage: () => keyStorage,
            } as unknown as Pick<FactoriesForBackend, 'keyStorage'>;

            await unlockDatabaseKey(services, 'password', NOOP_LOGGER, factories);
        }

        it('keeps only undecryptable errors retryable as password mismatches', async function () {
            const error = new KeyStorageError('undecryptable', 'wrong password');
            let caught: unknown;

            try {
                await unlockWith(error);
            } catch (thrown) {
                caught = thrown;
            }

            expect(caught).to.equal(error);
        });

        it('classifies archived key-storage factory failures as restoration unavailable', async function () {
            const error = new Error('archived profile path unavailable');
            const factories = {
                keyStorage: () => {
                    throw error;
                },
            } as unknown as Pick<FactoriesForBackend, 'keyStorage'>;
            let caught: unknown;

            try {
                await unlockDatabaseKey(services, 'password', NOOP_LOGGER, factories);
            } catch (thrown) {
                caught = thrown;
            }

            expect(caught).to.be.instanceOf(OldProfileRestorationUnavailableError);
            expect((caught as Error).cause).to.equal(error);
        });

        for (const type of [
            'not-readable',
            'not-writable',
            'malformed',
            'invalid',
            'migration-error',
        ] as const) {
            it(`classifies ${type} as restoration unavailable`, async function () {
                const error = new KeyStorageError(type, 'archived key storage unavailable');
                let caught: unknown;

                try {
                    await unlockWith(error);
                } catch (thrown) {
                    caught = thrown;
                }

                expect(caught).to.be.instanceOf(OldProfileRestorationUnavailableError);
                expect((caught as Error).cause).to.equal(error);
            });
        }
    });
}
