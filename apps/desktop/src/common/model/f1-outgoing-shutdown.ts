import {getOutgoingPreparationLane} from '~/common/model/f1-outgoing-preparation-lane';
import type {BlobBackend} from '~/common/network/protocol/blob';
import {getBlobUploadCoordinator} from '~/common/network/protocol/f1-blob-upload-coordinator';


/**
 * F1Whisper fork: stop all outgoing blob work of a backend for good (quit, unlink, device dropped).
 *
 * The order matters. The preparation lane is stopped FIRST, so that no queued job can start a fresh
 * upload; only then are the uploads that already run aborted. Done the other way round, every abort
 * would let the next queued job of the lane start a new upload that nothing cancels any more.
 *
 * Messages that were not finished stay in the durable outbox and resume on the next launch.
 */
export function stopOutgoingUploads(blob: BlobBackend, reason: 'quit' | 'teardown'): void {
    getOutgoingPreparationLane(blob).shutdown();
    getBlobUploadCoordinator(blob).abortAll(reason);
}
