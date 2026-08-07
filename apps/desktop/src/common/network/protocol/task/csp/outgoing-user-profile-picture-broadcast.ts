import {CspE2eContactControlType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact} from '~/common/model';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {
    profilePictureDistributionSteps,
    profilePictureDistributionActionForContact,
    profilePictureGenerationsEqual,
    readProfilePictureGeneration,
    type ProfilePictureDistributionAction,
    type ProfilePictureGeneration,
} from '~/common/network/protocol/task/common/user-profile-distribution';
import {
    OutgoingCspMessagesTask,
    type CspMessage,
} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import {randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import type {IdentityString} from '~/common/network/types';
import type {ReadonlyUint8Array, u53} from '~/common/types';

export interface UserProfilePictureDistributionRetry {
    readonly receiverIdentity: IdentityString;
    readonly pendingGeneration: u53;
}

/**
 * F1Whisper fork: broadcast the user's own profile picture (set or delete) to all
 * release-policy-allowed contacts at avatar-CHANGE time, instead of only lazily piggybacking the
 * update onto the next outgoing message to each contact (upstream's default, unchanged, behavior --
 * still runs via {@link profilePictureDistributionSteps} inside `OutgoingCspMessagesTask`). Mirrors
 * the Android fork's fix (v6.4.3-17 `UserServiceImpl.onUserProfilePictureChanged`): schedule this
 * task right after a local avatar set/remove so contacts see the change without needing a message
 * first.
 *
 * Reuses {@link profilePictureDistributionSteps} for the policy filtering (echoecho/gateway
 * excluded, `profilePictureShareWith` respected, Nobody = no-op) and per-contact 7-day distribution
 * cache (so the blob is uploaded/read once and a contact that was already notified of the current
 * picture is skipped -- idempotent to call on every avatar change, including redundant ones).
 */
export class OutgoingUserProfilePictureBroadcastTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _retry?: UserProfilePictureDistributionRetry,
    ) {
        this._log = _services.logging.logger(
            'network.protocol.task.outgoing-user-profile-picture-broadcast',
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const allContacts = new Set<Contact>();
        if (this._retry === undefined) {
            for (const contactStore of this._services.model.contacts.getAll().get()) {
                const contact = contactStore.get();
                if (
                    profilePictureDistributionActionForContact(this._services, contact) ===
                    undefined
                ) {
                    continue;
                }
                allContacts.add(contact);
            }
        } else {
            if (
                !this._services.persistentProtocolState.hasPendingUserProfileDistribution(
                    this._retry.receiverIdentity,
                    this._retry.pendingGeneration,
                )
            ) {
                return;
            }
            const contact = this._services.model.contacts
                .getByIdentity(this._retry.receiverIdentity)
                ?.get();
            if (
                contact === undefined ||
                profilePictureDistributionActionForContact(this._services, contact) === undefined
            ) {
                // Missing, invalid, gateway and echo recipients can never accept this control. Clear
                // only the generation recovery observed; temporary blocking instead plans DELETE.
                this._services.persistentProtocolState.deletePendingUserProfileDistribution(
                    this._retry.receiverIdentity,
                    this._retry.pendingGeneration,
                );
                return;
            }
            allContacts.add(contact);
        }
        if (allContacts.size === 0) {
            return;
        }

        // Distribution is forced (not gated on a triggering message's `allowUserProfileDistribution`
        // flag) because this broadcast IS the trigger -- there is no message.
        //
        // U-H04: the distribution cache commit is deferred (`commitDistributionCache: false`) --
        // committing it here, before anything is actually sent, would mark a contact as "notified"
        // even if its message never gets acked (e.g. a mid-broadcast disconnect), permanently
        // suppressing the 7-day-cache retry for a picture that contact never actually received. Each
        // contact's cache entry is committed below, individually, only after that specific contact's
        // message has been sent AND acked.
        const {set, remove, generation} = await profilePictureDistributionSteps(
            this._services,
            true,
            allContacts,
            {
                commitDistributionCache: false,
                forceDistribution: this._retry !== undefined,
            },
        );

        if (set === undefined && remove === undefined) {
            if (
                this._retry !== undefined &&
                profilePictureGenerationsEqual(
                    readProfilePictureGeneration(this._services),
                    generation,
                )
            ) {
                // No current control can be generated for this recipient (for example, gateway and
                // echo identities are excluded). Drop only the generation recovery observed.
                this._services.persistentProtocolState.deletePendingUserProfileDistribution(
                    this._retry.receiverIdentity,
                    this._retry.pendingGeneration,
                );
            }
            this._log.debug('No contacts to broadcast the profile picture change to');
            return;
        }

        // FU-H07: the picture bytes and sharing policy the plan above was built from, versioned
        // together as one generation. This broadcast sends to contacts sequentially, awaiting each
        // one's ack; the user can change (replace/remove) the picture or the sharing policy (e.g.
        // `everyone` -> `nobody`) at any point during that window. `isStale` re-reads the live
        // generation; the loops below check it before every send AND before every cache commit and
        // abort the rest of the broadcast the moment it no longer matches, so a superseded picture
        // or policy can neither be sent to a not-yet-reached contact nor recorded as distributed.
        // Superseding local changes schedule their own broadcast; otherwise the durable rows left by
        // the aborted work are re-planned by leader/periodic recovery.
        function isStale(currentGeneration: ProfilePictureGeneration): boolean {
            return !profilePictureGenerationsEqual(currentGeneration, generation);
        }

        // Enroll every generated control before the first network operation. A newer planner replaces
        // the row with a fresh AUTOINCREMENT generation, immediately invalidating this task's
        // preconditions and preventing an old ACK from clearing newer intent.
        const {persistentProtocolState} = this._services;
        const retry = this._retry;
        const pendingGenerations = new Map<IdentityString, u53>();
        function enroll(receiver: Contact): void {
            const pendingGeneration =
                retry === undefined
                    ? persistentProtocolState.upsertPendingUserProfileDistribution(
                          receiver.view.identity,
                          new Date(),
                      ).generation
                    : retry.pendingGeneration;
            pendingGenerations.set(receiver.view.identity, pendingGeneration);
        }
        for (const receiver of remove ?? []) {
            enroll(receiver);
        }
        for (const receiver of set?.contacts ?? []) {
            enroll(receiver);
        }

        const services = this._services;
        function preconditionFor(
            receiver: Contact,
            action: ProfilePictureDistributionAction,
        ): () => boolean {
            const pendingGeneration = pendingGenerations.get(receiver.view.identity);
            return () => {
                const current = services.model.contacts
                    .getByIdentity(receiver.view.identity)
                    ?.get();
                return (
                    pendingGeneration !== undefined &&
                    current?.ctx === receiver.ctx &&
                    !isStale(readProfilePictureGeneration(services)) &&
                    profilePictureDistributionActionForContact(services, current) === action &&
                    persistentProtocolState.hasPendingUserProfileDistribution(
                        receiver.view.identity,
                        pendingGeneration,
                    )
                );
            };
        }
        function clearPending(receiver: Contact): void {
            const pendingGeneration = pendingGenerations.get(receiver.view.identity);
            if (pendingGeneration !== undefined) {
                persistentProtocolState.deletePendingUserProfileDistribution(
                    receiver.view.identity,
                    pendingGeneration,
                );
            }
        }

        // U-H04: each contact is sent (and, on success, cache-committed) via its OWN
        // `OutgoingCspMessagesTask` call, independent of every other contact. This trades the
        // batching efficiency of a single call for per-contact ack granularity: one contact's send
        // failure must neither block nor falsely mark any other contact as notified, and a contact
        // whose send never completes must remain uncommitted and durably pending for leader/periodic
        // recovery (as well as the lazy per-message path), never silently and permanently skipped.
        let sentCount = 0;

        if (remove !== undefined) {
            for (const receiver of remove) {
                if (isStale(readProfilePictureGeneration(this._services))) {
                    this._log.info(
                        'Profile picture or sharing policy changed mid-broadcast, aborting the remaining removals',
                    );
                    return;
                }
                const precondition = preconditionFor(receiver, 'delete');
                const message: CspMessage = {
                    receiver: {main: receiver},
                    precondition,
                    sharedMessageProperties: {
                        messageId: randomMessageId(this._services.crypto),
                        createdAt: new Date(),
                        allowUserProfileDistribution: false,
                    },
                    specifics: {
                        default: {
                            encoder: structbuf.bridge.encoder(
                                structbuf.csp.e2e.DeleteProfilePicture,
                                {},
                            ),
                            messageProperties: {
                                type: CspE2eContactControlType.CONTACT_DELETE_PROFILE_PICTURE,
                                cspMessageFlags: CspMessageFlags.none(),
                            },
                        },
                    },
                };
                try {
                    const sentMessages = await new OutgoingCspMessagesTask(this._services, [
                        message,
                    ]).run(handle);
                    if (sentMessages === 0 || !precondition()) {
                        this._log.info(
                            'Profile picture or sharing policy changed while sending, not recording the removal and aborting the rest',
                        );
                        return;
                    }
                    this._services.persistentProtocolState.setLastUserProfileDistributionState(
                        receiver.view.identity,
                        {type: 'removed'},
                        new Date(),
                    );
                    clearPending(receiver);
                    sentCount += 1;
                } catch (error) {
                    this._log.warn(
                        `Failed to broadcast profile picture removal to ${receiver.view.identity}, leaving it pending for durable recovery: ${error}`,
                    );
                }
            }
        }

        if (set !== undefined) {
            for (const receiver of set.contacts) {
                if (isStale(readProfilePictureGeneration(this._services))) {
                    this._log.info(
                        'Profile picture or sharing policy changed mid-broadcast, aborting the remaining picture sends',
                    );
                    return;
                }
                const precondition = preconditionFor(receiver, 'set');
                const message: CspMessage = {
                    receiver: {main: receiver},
                    precondition,
                    sharedMessageProperties: {
                        messageId: randomMessageId(this._services.crypto),
                        createdAt: new Date(),
                        allowUserProfileDistribution: false,
                    },
                    specifics: {
                        default: {
                            encoder: structbuf.bridge.encoder(structbuf.csp.e2e.SetProfilePicture, {
                                key: set.key.unwrap() as Uint8Array,
                                pictureBlobId: set.blobId as ReadonlyUint8Array as Uint8Array,
                                pictureSize: set.size,
                            }),
                            messageProperties: {
                                type: CspE2eContactControlType.CONTACT_SET_PROFILE_PICTURE,
                                cspMessageFlags: CspMessageFlags.none(),
                            },
                        },
                    },
                };
                try {
                    const sentMessages = await new OutgoingCspMessagesTask(this._services, [
                        message,
                    ]).run(handle);
                    if (sentMessages === 0 || !precondition()) {
                        this._log.info(
                            'Profile picture or sharing policy changed while sending, not recording this contact and aborting the rest',
                        );
                        return;
                    }
                    this._services.persistentProtocolState.setLastUserProfileDistributionState(
                        receiver.view.identity,
                        {blobId: set.blobId, type: 'profile-picture'},
                        new Date(),
                    );
                    clearPending(receiver);
                    sentCount += 1;
                } catch (error) {
                    this._log.warn(
                        `Failed to broadcast profile picture to ${receiver.view.identity}, leaving it pending for durable recovery: ${error}`,
                    );
                }
            }
        }

        this._log.info(`Broadcast profile picture change to ${sentCount} contact(s)`);
    }
}
