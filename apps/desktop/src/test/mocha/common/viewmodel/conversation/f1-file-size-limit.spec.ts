import {expect} from 'chai';

import {
    isPreparedPayloadTooLarge,
    SEND_MESSAGE_NOTHING_REFUSED,
} from '~/common/viewmodel/conversation/main/controller/f1-file-size-limit';

/**
 * Bundled at build time, so no runtime path is needed.
 */
const CONTROLLER_SOURCES = import.meta.glob<string>(
    '../../../../../common/viewmodel/conversation/main/controller/index.ts',
    {eager: true, query: '?raw', import: 'default'},
);

const MIB = 1024 * 1024;

/**
 * Build-time constant (vite-defined), not process environment, so the turbo rule does not apply.
 */
/* eslint-disable turbo/no-undeclared-env-vars */
const MAX_FILE_MESSAGE_BYTES = import.meta.env.MAX_FILE_MESSAGE_BYTES;
/* eslint-enable turbo/no-undeclared-env-vars */

/**
 * Remove line and block comments from TypeScript source, leaving string and template literals
 * intact, so structural pins cannot be satisfied (or tripped) by prose in a comment.
 */
function stripComments(source: string): string {
    let out = '';
    let i = 0;
    while (i < source.length) {
        const char = source[i] ?? '';
        const next = source[i + 1];
        if (char === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') {
                i += 1;
            }
        } else if (char === '/' && next === '*') {
            const endIndex = source.indexOf('*/', i + 2);
            i = endIndex === -1 ? source.length : endIndex + 2;
        } else if (char === "'" || char === '"' || char === '`') {
            const quote = char;
            out += char;
            i += 1;
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\') {
                    out += source[i] ?? '';
                    i += 1;
                }
                out += source[i] ?? '';
                i += 1;
            }
            out += quote;
            i += 1;
        } else {
            out += char;
            i += 1;
        }
    }
    return out;
}

const PAYLOAD_CASES = ['FILE', 'VIDEO', 'AUDIO', 'IMAGE'] as const;
const PAYLOAD_GUARD = /\bisPreparedPayloadTooLarge\s*\(/u;
const PAYLOAD_STORE = /\bfileData\s*:\s*await\s+file\.store\s*\(/u;

/**
 * Split the preparation method into its `case MessageType.<X>:` segments and return the payload
 * cases that do not run the size guard BEFORE they store the payload (or that never store it).
 */
function unguardedPayloadCases(source: string): string[] {
    const start = source.indexOf('private async _prepareFileBasedMessageInitFragments(');
    const method = start === -1 ? '' : source.slice(start);
    const segments = method.split(/\bcase\s+MessageType\./u).slice(1);
    return PAYLOAD_CASES.filter((name) => {
        const segment = segments.find((candidate) => candidate.startsWith(`${name}:`));
        if (segment === undefined) {
            return true;
        }
        const guard = segment.search(PAYLOAD_GUARD);
        const store = segment.search(PAYLOAD_STORE);
        return guard === -1 || store === -1 || guard > store;
    });
}

export function run(): void {
    describe('viewmodel::conversation::f1-file-size-limit', function () {
        describe('isPreparedPayloadTooLarge', function () {
            it('the build-time limit is 220 MiB', function () {
                expect(MAX_FILE_MESSAGE_BYTES).to.equal(220 * MIB);
            });

            it('accepts a payload exactly at the limit and refuses one byte more', function () {
                expect(isPreparedPayloadTooLarge(220 * MIB)).to.equal(false);
                expect(isPreparedPayloadTooLarge(220 * MIB + 1)).to.equal(true);
            });

            it('accepts the former 100 MiB ceiling and small payloads', function () {
                expect(isPreparedPayloadTooLarge(100 * MIB)).to.equal(false);
                expect(isPreparedPayloadTooLarge(100 * MIB + 1)).to.equal(false);
                expect(isPreparedPayloadTooLarge(0)).to.equal(false);
            });

            it('honours an explicit limit', function () {
                expect(isPreparedPayloadTooLarge(10, 10)).to.equal(false);
                expect(isPreparedPayloadTooLarge(11, 10)).to.equal(true);
            });
        });

        describe('sends that refuse nothing', function () {
            it('report no refused files', function () {
                expect(SEND_MESSAGE_NOTHING_REFUSED.tooLargeFileNames).to.deep.equal([]);
            });
        });

        describe('controller source pin', function () {
            const source = stripComments(Object.values(CONTROLLER_SOURCES)[0] ?? '');
            expect(source, 'controller source loaded').to.have.length.greaterThan(1000);

            it('every payload case checks the prepared size before it stores the payload', function () {
                expect(unguardedPayloadCases(source)).to.deep.equal([]);
            });

            it('the pin detects a missing guard (red probe fixture)', function () {
                const fixture = [
                    'private async _prepareFileBasedMessageInitFragments(',
                    ') {',
                    '  switch (messageType) {',
                    '    case MessageType.FILE:',
                    '      push({fileData: await file.store(fileInfo.bytes)});',
                    '      break;',
                    '    case MessageType.VIDEO:',
                    '      if (isPreparedPayloadTooLarge(bytes.byteLength)) { break; }',
                    '      push({fileData: await file.store(bytes)});',
                    '      break;',
                    '    case MessageType.AUDIO:',
                    '      push({fileData: await file.store(bytes)});',
                    '      if (isPreparedPayloadTooLarge(bytes.byteLength)) { break; }',
                    '      break;',
                    '    case MessageType.IMAGE:',
                    '      if (isPreparedPayloadTooLarge(fileInfo.bytes.byteLength)) { break; }',
                    '      push({fileData: await file.store(fileInfo.bytes)});',
                    '      break;',
                    '  }',
                    '}',
                ].join('\n');
                expect(unguardedPayloadCases(stripComments(fixture))).to.deep.equal([
                    'FILE',
                    'AUDIO',
                ]);
            });

            it('a guard that only appears in a comment does not satisfy the pin (red probe fixture)', function () {
                const fixture = [
                    'private async _prepareFileBasedMessageInitFragments(',
                    ') {',
                    '    case MessageType.FILE:',
                    '      // if (isPreparedPayloadTooLarge(fileInfo.bytes.byteLength)) { break; }',
                    '      push({fileData: await file.store(fileInfo.bytes)});',
                    '      break;',
                    '}',
                ].join('\n');
                expect(unguardedPayloadCases(stripComments(fixture))).to.include('FILE');
            });
        });
    });
}
