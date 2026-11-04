import {expect} from 'chai';

import {stripComments} from '~/test/mocha/common/strip-comments';

/**
 * Structural pins for where outgoing blob uploads are (and are not) aborted (F1Whisper fork).
 * The behaviour of the aborts is tested in `outgoing-blob-uploads.spec.ts` and
 * `f1-blob-upload-coordinator.spec.ts`; these pins keep the wiring from silently changing.
 *
 * Sources are bundled at build time. Comments are stripped before matching.
 */
const sources = import.meta.glob<string>(
    [
        '../../../../common/dom/backend/index.ts',
        '../../../../common/dom/network/protocol/connection.ts',
        '../../../../common/dom/network/protocol/pipeline.ts',
        '../../../../common/network/protocol/task/manager.ts',
        '../../../../common/network/protocol/task/csp/outgoing-conversation-message.ts',
        '../../../../common/model/conversation.ts',
        '../../../../common/model/f1-outgoing-shutdown.ts',
        '../../../../common/model/outgoing-message-outbox.ts',
        '../../../../common/model/f1-outgoing-message-dispatch.ts',
        '../../../../app/ui/components/partials/conversation/internal/message-list/internal/regular-message/RegularMessage.svelte',
    ],
    {eager: true, query: '?raw', import: 'default'},
);

function sourceEndingWith(suffix: string): string {
    const entry = Object.entries(sources).find(([path]) => path.endsWith(suffix));
    expect(entry, `source ${suffix} bundled`).to.not.equal(undefined);
    const stripped = stripComments(entry?.[1] ?? '');
    expect(stripped, `source ${suffix} loaded`).to.have.length.greaterThan(200);
    return stripped;
}

const ABORT_CALL = /\.(?:abortAll|abortMessage)\s*\(/u;

function countAbortCalls(source: string): number {
    return source.split(ABORT_CALL).length - 1;
}

/** The body of the first `flushPendingOutgoing: async (` arrow function in the backend handle. */
const QUIT_FLUSH_HANDLER =
    /flushPendingOutgoing:\s*async\s*\(timeoutMs\)\s*=>\s*\{(?<body>[\s\S]*?)\n\s{12}\},/u;

export function run(): void {
    describe('model::blob-upload-abort-triggers', function () {
        describe('quit', function () {
            const source = sourceEndingWith('dom/backend/index.ts');

            it('aborts the surviving uploads AFTER the bounded graceful flush', function () {
                const body = QUIT_FLUSH_HANDLER.exec(source)?.groups?.body ?? '';
                expect(body, 'flush handler found').to.have.length.greaterThan(50);
                const flush = body.indexOf('this._connectionManager.flushPendingOutgoing(');
                const abort = body.indexOf("stopOutgoingUploads(this._services.blob, 'quit')");
                expect(flush, 'the flush still runs').to.be.greaterThan(-1);
                expect(abort, 'uploads are aborted on quit').to.be.greaterThan(-1);
                expect(abort, 'abort comes after the flush').to.be.greaterThan(flush);
            });

            it('the pin detects an abort that runs before the flush (red probe fixture)', function () {
                const regressed = [
                    'flushPendingOutgoing: async (timeoutMs) => {',
                    "    stopOutgoingUploads(this._services.blob, 'quit');",
                    '    const remaining = await this._connectionManager.flushPendingOutgoing(timeoutMs);',
                    '    return remaining;',
                    '            },',
                ].join('\n');
                const body = QUIT_FLUSH_HANDLER.exec(regressed)?.groups?.body ?? '';
                expect(
                    body.indexOf("stopOutgoingUploads(this._services.blob, 'quit')"),
                ).to.be.lessThan(body.indexOf('this._connectionManager.flushPendingOutgoing('));
            });
        });

        describe('quit flush covers the preparation lane', function () {
            const source = sourceEndingWith('dom/backend/index.ts');
            const body = QUIT_FLUSH_HANDLER.exec(source)?.groups?.body ?? '';

            it('drains the lane first, then flushes the task queue, and reports both', function () {
                const drain = body.indexOf('lane.drain(');
                const taskFlush = body.indexOf('this._connectionManager.flushPendingOutgoing(');
                expect(drain, 'the lane is drained').to.be.greaterThan(-1);
                expect(taskFlush, 'the task queue is still flushed').to.be.greaterThan(drain);
                expect(body).to.match(/laneRemaining\s*\+\s*taskRemaining/u);
            });

            it('stops the lane and aborts the survivors through one helper, after the flush', function () {
                expect(body).to.match(/stopOutgoingUploads\(this\._services\.blob, 'quit'\)/u);
                expect(body).to.not.match(/\.abortAll\(/u);
            });
        });

        describe('every send goes through the lane', function () {
            it('a new message and the outbox recovery dispatch, and never schedule the task directly', function () {
                for (const suffix of [
                    'model/conversation.ts',
                    'model/outgoing-message-outbox.ts',
                ]) {
                    const source = sourceEndingWith(suffix);
                    expect(source, suffix).to.match(/\bdispatchOutgoingMessage\s*\(/u);
                    expect(source, suffix).to.not.match(/new\s+OutgoingConversationMessageTask\b/u);
                }
            });

            it('only the lane schedules the conversation task', function () {
                const dispatch = sourceEndingWith('f1-outgoing-message-dispatch.ts');
                expect(dispatch).to.match(/new\s+OutgoingConversationMessageTask\s*\(/u);
            });

            it('the conversation task never uploads, so no upload error can reach the task manager', function () {
                const task = sourceEndingWith('task/csp/outgoing-conversation-message.ts');
                expect(task).to.not.match(/\buploadBlobs\b/u);
                expect(task).to.not.match(/\.upload\s*\(/u);
            });

            it('the pin detects an upload inside the task (red probe fixture)', function () {
                const regressed =
                    'uploadedBlobBytes = await message.get().controller.uploadBlobs();';
                expect(regressed).to.match(/\buploadBlobs\b/u);
                expect(stripComments('// uploadBlobs() is gone')).to.not.match(/\buploadBlobs\b/u);
            });
        });

        describe('clearing a conversation', function () {
            it('cancels the uploads of its messages when the send intent is invalidated', function () {
                const source = sourceEndingWith('model/conversation.ts');
                expect(source).to.match(
                    /deleteOutgoingMessageOutboxEntriesForConversation\([^)]*\);\s*getBlobUploadCoordinator\([^)]*\)\.abortConversation\(/u,
                );
            });
        });

        describe('teardown', function () {
            const source = sourceEndingWith('dom/network/protocol/connection.ts');
            const STOP_CALL = "stopOutgoingUploads(this._services.blob, 'teardown')";

            it('stops outgoing work when the device is dropped, through the helper only', function () {
                expect(source).to.match(
                    /case\s+CloseCode\.EXPECTED_DEVICE_SLOT_STATE_MISMATCH:\s*stopOutgoingUploads\(this\._services\.blob, 'teardown'\)/u,
                );
                expect(source.split(STOP_CALL), 'exactly the two teardown sites').to.have.length(3);
                expect(countAbortCalls(source), 'no direct abort next to the helper').to.equal(0);
            });

            it('stops outgoing work after a SUCCESSFUL unlink, never before and never on failure', function () {
                const start = source.indexOf('public async selfKickFromMediator(');
                const end = source.indexOf('\n    }\n', start);
                const body = source.slice(start, end);
                const drop = body.indexOf('new DropDeviceTask(');
                const fallback = body.indexOf('_startD2mOnlyConnectionAndUnlink()');
                const stop = body.indexOf("stopOutgoingUploads(this._services.blob, 'teardown')");
                expect(drop, 'the unlink is attempted').to.be.greaterThan(-1);
                expect(fallback, 'with its fallback').to.be.greaterThan(drop);
                expect(stop, 'the lane is stopped').to.be.greaterThan(fallback);
                // Not inside the catch: a failing fallback rejects before reaching the stop.
                expect(body.slice(stop)).to.not.match(/catch/u);
            });

            it('the helper stops the lane BEFORE it aborts the running uploads', function () {
                const helper = sourceEndingWith('model/f1-outgoing-shutdown.ts');
                const shutdown = helper.indexOf('.shutdown()');
                const abort = helper.indexOf('.abortAll(reason)');
                expect(shutdown).to.be.greaterThan(-1);
                expect(abort).to.be.greaterThan(shutdown);
            });
        });

        describe('reconnect is not an abort', function () {
            it('the task manager and the connection pipeline never abort uploads', function () {
                expect(
                    countAbortCalls(sourceEndingWith('network/protocol/task/manager.ts')),
                ).to.equal(0);
                expect(
                    countAbortCalls(sourceEndingWith('dom/network/protocol/pipeline.ts')),
                ).to.equal(0);
            });

            it('the abort counter detects an abort call (red probe fixture)', function () {
                expect(countAbortCalls("coordinator.abortAll('quit');")).to.equal(1);
                expect(countAbortCalls('// coordinator.abortAll() in a comment')).to.equal(1);
                expect(
                    countAbortCalls(stripComments('// coordinator.abortAll() in a comment')),
                ).to.equal(0);
            });
        });

        describe('delete as cancel', function () {
            const source = sourceEndingWith('regular-message/RegularMessage.svelte');

            it('deleting is allowed while an upload (not a download) is syncing', function () {
                expect(source).to.match(
                    /deleteMessage:\s*file === undefined \|\|\s*file\.sync\.state !== 'syncing' \|\|\s*file\.sync\.direction === 'upload'/u,
                );
            });
        });
    });
}
