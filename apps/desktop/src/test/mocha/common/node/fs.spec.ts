import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {expect} from 'chai';

import {writeFileAtomically} from '~/common/node/fs';

async function exists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Tests for the crash-safe atomic file write (P-M08).
 */
export function run(): void {
    describe('node::fs writeFileAtomically', function () {
        let directory: string;
        let targetPath: string;

        this.beforeEach(async function () {
            directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'f1w-atomic-'));
            targetPath = path.join(directory, 'identity.bin');
        });
        this.afterEach(async function () {
            await fsPromises.rm(directory, {recursive: true, force: true});
        });

        it('writes new content and leaves no temporary artifact', async function () {
            const content = new Uint8Array([1, 2, 3, 4]);
            await writeFileAtomically(targetPath, content);

            expect(Buffer.compare(await fsPromises.readFile(targetPath), Buffer.from(content))).to.equal(
                0,
            );
            expect(await exists(`${targetPath}.tmp`), 'no leftover temp file').to.be.false;
        });

        it('replaces existing content and retains the previous copy at the backup path', async function () {
            const before = new Uint8Array([10, 20, 30]);
            const after = new Uint8Array([40, 50, 60, 70]);
            const backupPath = `${targetPath}.bak`;

            await writeFileAtomically(targetPath, before, {backupPath});
            await writeFileAtomically(targetPath, after, {backupPath});

            expect(
                Buffer.compare(await fsPromises.readFile(targetPath), Buffer.from(after)),
                'target has the new content',
            ).to.equal(0);
            expect(
                Buffer.compare(await fsPromises.readFile(backupPath), Buffer.from(before)),
                'backup retains the previous content',
            ).to.equal(0);
        });

        it('overwrites (does not append to) a stale temporary file from a prior crash', async function () {
            await fsPromises.writeFile(`${targetPath}.tmp`, new Uint8Array([0xff, 0xff, 0xff, 0xff]));
            const content = new Uint8Array([1, 2]);
            await writeFileAtomically(targetPath, content);
            expect(Buffer.compare(await fsPromises.readFile(targetPath), Buffer.from(content))).to.equal(
                0,
            );
        });

        it('leaves an existing target fully intact when the write fails (fault injection)', async function () {
            const original = new Uint8Array([9, 8, 7, 6, 5]);
            await fsPromises.writeFile(targetPath, original);

            // Force the temp write to fail by pre-creating the temp path as a directory, so opening
            // it for writing throws before the real target is ever touched.
            await fsPromises.mkdir(`${targetPath}.tmp`);

            let threw = false;
            try {
                await writeFileAtomically(targetPath, new Uint8Array([1, 1, 1]), {
                    backupPath: `${targetPath}.bak`,
                });
            } catch {
                threw = true;
            }
            expect(threw, 'the write should fail').to.be.true;
            // The original file is untouched and fully readable (never truncated).
            expect(
                Buffer.compare(await fsPromises.readFile(targetPath), Buffer.from(original)),
            ).to.equal(0);
        });
    });
}
