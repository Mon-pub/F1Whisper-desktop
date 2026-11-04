import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import {byteEquals} from '@threema/ts-utils/byte/byte-equals';
import type {u53} from '@threema/ts-utils/integer/u53';

import {AcquaintanceLevel, ActivityState, GroupUserState} from '~/common/enum';
import type {Contact} from '~/common/model';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';
import {encryptAndUploadBlob, type BlobId} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import type {ServicesForTasks} from '~/common/network/protocol/task';
import type {RawBlobKey} from '~/common/network/types/keys';
import {LAST_USER_PROFILE_ENTRY_EXPIRATION_SECONDS} from '~/common/network/types/persistent-protocol-state';
import {unreachable} from '~/common/utils/assert';

export type ProfilePictureDistributionAction = 'set' | 'delete';

/**
 * F1Whisper fork (FU-H07): a snapshot of everything that determines WHAT this client should
 * distribute to contacts and TO WHOM: the profile picture bytes (or their absence) and the sharing
 * policy, versioned together as ONE generation.
 *
 * The distribution steps capture the current generation when they build a distribution plan; the
 * caller (avatar-change broadcast) re-reads the live generation before every per-contact send and
 * before every cache commit and aborts if it has changed. This is what stops an in-flight broadcast
 * from sending (or recording as "distributed") a picture/policy the user has since replaced,
 * removed, or restricted -- e.g. a mid-broadcast switch from `everyone` to `nobody`, or a picture
 * swap, must never reach the contacts that have not been sent to yet.
 */
export interface ProfilePictureGeneration {
    /** The current profile picture bytes, or `undefined` if there is no profile picture. */
    readonly picture: ReadonlyUint8Array | undefined;
    /** The currently authoritative encrypted upload, if one exists. */
    readonly blobId: BlobId | undefined;
    /** The current sharing policy. */
    readonly shareWith: ProfilePictureShareWith;
}

/**
 * Read the current {@link ProfilePictureGeneration} from the user's profile settings.
 */
export function readProfilePictureGeneration(
    services: Pick<ServicesForTasks, 'model'>,
): ProfilePictureGeneration {
    const view = services.model.user.profileSettings.get().view;
    return {
        picture: view.profilePicture?.blob,
        blobId: view.profilePicture?.blobId,
        shareWith: view.profilePictureShareWith,
    };
}

function profilePictureShareWithEquals(
    a: ProfilePictureShareWith,
    b: ProfilePictureShareWith,
): boolean {
    if (a.group !== b.group) {
        return false;
    }
    // Compare the allow list as an (order-insensitive) set: reordering the same identities is not a
    // meaningful policy change.
    if (a.group === 'allowList' && b.group === 'allowList') {
        const aIdentities = new Set(a.allowList);
        const bIdentities = new Set(b.allowList);
        if (aIdentities.size !== bIdentities.size) {
            return false;
        }
        return [...aIdentities].every((identity) => bIdentities.has(identity));
    }
    return true;
}

/**
 * Whether two {@link ProfilePictureGeneration}s describe the same picture bytes AND the same sharing
 * policy. A difference in either means the generation has advanced and an in-flight distribution
 * built for the older generation is now stale.
 */
export function profilePictureGenerationsEqual(
    a: ProfilePictureGeneration,
    b: ProfilePictureGeneration,
): boolean {
    if ((a.picture === undefined) !== (b.picture === undefined)) {
        return false;
    }
    if (a.picture !== undefined && b.picture !== undefined && !byteEquals(a.picture, b.picture)) {
        return false;
    }
    if ((a.blobId === undefined) !== (b.blobId === undefined)) {
        return false;
    }
    if (a.blobId !== undefined && b.blobId !== undefined && !byteEquals(a.blobId, b.blobId)) {
        return false;
    }
    return profilePictureShareWithEquals(a.shareWith, b.shareWith);
}

function isGatewayOrEcho(contact: Contact): boolean {
    return contact.view.identity.startsWith('*') || contact.view.identity === 'ECHOECHO';
}

function isDirectOrCommonGroupContact(
    services: Pick<ServicesForTasks, 'model'>,
    contact: Contact,
): boolean {
    if (contact.view.acquaintanceLevel === AcquaintanceLevel.DIRECT) {
        return true;
    }
    for (const groupStore of services.model.groups.getAll().get()) {
        const group = groupStore.get().view;
        if (
            group.userState === GroupUserState.MEMBER &&
            ((group.creator !== 'me' &&
                group.creator.get().view.identity === contact.view.identity) ||
                [...group.members].some(
                    (memberStore) => memberStore.get().view.identity === contact.view.identity,
                ))
        ) {
            return true;
        }
    }
    return false;
}

function sharingPolicyAllowsContact(shareWith: ProfilePictureShareWith, contact: Contact): boolean {
    switch (shareWith.group) {
        case 'everyone':
            return true;
        case 'nobody':
            return false;
        case 'allowList':
            return shareWith.allowList.includes(contact.view.identity);
        default:
            return unreachable(shareWith);
    }
}

/**
 * Resolve the control currently required for a contact. SET is restricted to live, unblocked direct
 * contacts or active common-group members. DELETE deliberately remains available for blocked and
 * soft-deleted contacts so a privacy restriction can clean up a picture they may have received.
 */
export function profilePictureDistributionActionForContact(
    services: Pick<ServicesForTasks, 'model'>,
    contact: Contact,
): ProfilePictureDistributionAction | undefined {
    if (contact.view.activityState === ActivityState.INVALID || isGatewayOrEcho(contact)) {
        return undefined;
    }
    const profile = services.model.user.profileSettings.get().view;
    if (
        profile.profilePicture === undefined ||
        !sharingPolicyAllowsContact(profile.profilePictureShareWith, contact) ||
        services.model.user.privacySettings
            .get()
            .controller.isContactBlocked(contact.view.identity) ||
        !isDirectOrCommonGroupContact(services, contact)
    ) {
        return 'delete';
    }
    return 'set';
}

/**
 * Synchronously persist the current desired control before local D2D/network waits. Existing pending
 * intent is always superseded. Matching SET/DELETE ACK cache entries without pending uncertainty are
 * skipped to avoid durable rows for already-converged recipients.
 */
export function enrollPendingUserProfilePictureDistributions(
    services: Pick<ServicesForTasks, 'model' | 'persistentProtocolState'>,
    options: {
        readonly contacts?: Iterable<Contact>;
        readonly preserveExisting?: boolean;
    } = {},
): void {
    const pendingIdentities = new Set(
        services.persistentProtocolState
            .getPendingUserProfileDistributions()
            .map(({receiverIdentity}) => receiverIdentity),
    );
    const profilePicture = services.model.user.profileSettings.get().view.profilePicture;
    const contacts =
        options.contacts ??
        [...services.model.contacts.getAll().get()].map((contactStore) => contactStore.get());
    for (const contact of contacts) {
        const action = profilePictureDistributionActionForContact(services, contact);
        if (action === undefined) {
            continue;
        }
        if (options.preserveExisting === true && pendingIdentities.has(contact.view.identity)) {
            continue;
        }
        const cache = services.persistentProtocolState.getLastUserProfileDistributionState(
            contact.view.identity,
        );
        const reusableBlobId =
            profilePicture?.blobId !== undefined &&
            profilePicture.key !== undefined &&
            profilePicture.lastUploadedAt !== undefined &&
            Date.now() - profilePicture.lastUploadedAt.getTime() <=
                LAST_USER_PROFILE_ENTRY_EXPIRATION_SECONDS * 1000
                ? profilePicture.blobId
                : undefined;
        const alreadyConverged =
            action === 'delete'
                ? cache?.type === 'removed'
                : reusableBlobId !== undefined &&
                  cache?.type === 'profile-picture' &&
                  byteEquals(cache.blobId, reusableBlobId);
        if (alreadyConverged && !pendingIdentities.has(contact.view.identity)) {
            continue;
        }
        services.persistentProtocolState.upsertPendingUserProfileDistribution(
            contact.view.identity,
            new Date(),
        );
    }
}

export interface ProfileDistributionResult {
    readonly remove?: Set<Contact>;
    readonly set?: {
        readonly contacts: Set<Contact>;
        readonly blobId: BlobId;
        readonly key: RawBlobKey;
        readonly size: u53;
    };
    /**
     * The {@link ProfilePictureGeneration} this plan was built from. The caller re-reads the live
     * generation (via {@link readProfilePictureGeneration}) before every per-contact send and cache
     * commit and aborts if it no longer {@link profilePictureGenerationsEqual}s this one.
     */
    readonly generation: ProfilePictureGeneration;
}

/**
 * Run the user profile picture distribution steps.
 *
 * Returns the contacts to which to send a `set_profile_picture` message and the contacts to which
 * to send a `delete_profile_picture` message.
 *
 * PR3-H05 durable-retry model: the per-receiver distribution cache remains the last-ACK state. The
 * eager and lazy callers separately enroll every generated control in the dedicated pending table
 * before network I/O, then clear it only after an ACK under the same profile and pending-row
 * generations. Recovery re-runs these planning steps against current picture/privacy state rather
 * than persisting and replaying a stale set/delete action.
 *
 * @param options.commitDistributionCache Whether to persist the per-receiver distribution cache
 *   entries computed by this call (default `true`). F1Whisper fork (U-H04 / FU-H07): both the eager
 *   avatar-change broadcast (`OutgoingUserProfilePictureBroadcastTask`) and the lazy per-message
 *   distribution (`OutgoingCspMessagesTask`) pass `false` here and commit each receiver's cache entry
 *   themselves, ONLY after that receiver's CSP message is actually acked -- committing eagerly (as
 *   this function used to, unconditionally) marks a receiver as "notified" even if the send never
 *   completes, permanently losing that notification (the 7-day cache then suppresses any retry).
 * @param options.forceDistribution Ignore matching ACK-cache entries. Durable retry uses this
 *   because a failed/unknown-ACK SET may still have reached the recipient; if current privacy now
 *   requires DELETE, an older cached remove mark must not suppress that deletion.
 */
export async function profilePictureDistributionSteps(
    services: ServicesForTasks,
    userProfileDistribution: boolean,
    receiverContacts: Set<Contact>,
    options: {
        readonly commitDistributionCache?: boolean;
        readonly forceDistribution?: boolean;
    } = {},
): Promise<ProfileDistributionResult> {
    const {persistentProtocolState} = services;
    const commitDistributionCache = options.commitDistributionCache ?? true;
    const forceDistribution = options.forceDistribution ?? false;

    let remove: ProfileDistributionResult['remove'] = undefined;

    // FU-H07: capture the generation (picture bytes + sharing policy, versioned together) this plan
    // is built from, and return it so the caller can revalidate it before every send and commit.
    const profileView = services.model.user.profileSettings.get().view;
    const currentProfilePicture = profileView.profilePicture;
    let generation = readProfilePictureGeneration(services);

    // 3. If the message does not allow user profile distribution abort these steps.
    if (!userProfileDistribution) {
        return {remove, set: undefined, generation};
    }

    // Pass 1 (U-H04: eligibility filtered first, before any async/upload work): split receivers into
    // those that should get a _remove_ message (policy-ineligible, or no current picture) and those
    // that are candidates for a _set_ message.
    const pictureEligibleReceivers: Contact[] = [];
    for (const receiver of receiverContacts.values()) {
        const action = profilePictureDistributionActionForContact(services, receiver);
        if (action === undefined) {
            continue;
        }

        // 6.  If the settings indicate that the user's profile picture should be shared with nobody
        //     or the settings associated to `receiver` indicate that the profile picture should not
        //     be distributed to it:
        if (action === 'delete') {
            // Is defined if there is a cache entry towards the receiver that is not expired (i.e
            // from within the last 7 days).
            const cache = persistentProtocolState.getLastUserProfileDistributionState(
                receiver.view.identity,
            );

            // 6.1. If `cache` is a _remove_ mark and indicates that the most recent
            // delete-profile-picture message towards `receiver` was sent less than seven days ago,
            // abort these steps without a message.
            if (!forceDistribution && cache?.type === 'removed') {
                continue;
            }

            // 6.2. Update the `cache` for `receiver` to a _remove_ mark with the current timestamp.
            if (commitDistributionCache) {
                persistentProtocolState.setLastUserProfileDistributionState(
                    receiver.view.identity,
                    {type: 'removed'},
                    new Date(),
                );
            }

            // Add the receiver to the list of contacts that should receive a delete-profile-picture
            // message.
            remove ??= new Set<Contact>();
            remove.add(receiver);
            continue;
        }

        pictureEligibleReceivers.push(receiver);
    }

    if (pictureEligibleReceivers.length === 0 || currentProfilePicture === undefined) {
        return {remove, set: undefined, generation};
    }

    // Pass 2 (U-H04: upload at most once per call, not once per receiver): the blob upload/reuse
    // decision depends only on the CURRENT picture, not on any individual receiver, so it is made
    // once here and shared by every eligible receiver below -- the original per-receiver loop
    // re-checked a picture snapshot captured before the loop started, so if the picture needed a
    // fresh upload, EVERY eligible receiver triggered its own redundant upload.
    let blobId: BlobId;
    let key: RawBlobKey;
    let eligibleForSet: readonly Contact[];
    // Contrarily to the protocol, we do not explicitly remove the actual profile picture if it was
    // expired. However, we translate this into a condition.
    //
    // Note: If one of the profile picture properties is undefined, we upload it once in any case
    // since this is a relict from older versions. If the current profile picture is too old, we
    // upload it to the server in any case.
    if (
        currentProfilePicture.lastUploadedAt === undefined ||
        currentProfilePicture.key === undefined ||
        currentProfilePicture.blobId === undefined ||
        Date.now() - currentProfilePicture.lastUploadedAt.getTime() >
            LAST_USER_PROFILE_ENTRY_EXPIRATION_SECONDS * 1000
    ) {
        const blobInfo = await encryptAndUploadBlob(
            services,
            currentProfilePicture.blob,
            BLOB_FILE_NONCE,
            'public-persistent',
        );

        // U-H04 / FU-H07: the picture bytes or the sharing policy may have been superseded by a
        // concurrent change while this upload was in flight -- if so, this now-stale upload result
        // must not be distributed or cached.
        if (!profilePictureGenerationsEqual(readProfilePictureGeneration(services), generation)) {
            return {remove, set: undefined, generation};
        }

        blobId = blobInfo.id;
        key = blobInfo.key;
        // Update the cache model view. Note: since the picture needed a fresh upload, every eligible
        // receiver gets the new blob regardless of its per-receiver distribution cache (the server
        // copy of the OLD blob may have expired, so the cache's memory of it is no longer useful).
        services.model.user.profileSettings.get().controller.update.direct({
            profilePicture: {
                blob: currentProfilePicture.blob,
                blobId,
                key,
                lastUploadedAt: new Date(),
            },
        });
        // The upload metadata is part of the generation. Continue this plan under the freshly
        // persisted blob ID while still invalidating any concurrent reflected/local replacement.
        generation = readProfilePictureGeneration(services);
        eligibleForSet = pictureEligibleReceivers;
    } else {
        blobId = currentProfilePicture.blobId;
        key = currentProfilePicture.key;
        const freshBlobId = currentProfilePicture.blobId;
        // 8. Drop receivers whose cache already reflects this exact (still-fresh) blob ID -- a
        // redundant resend within the 7-day window.
        eligibleForSet = pictureEligibleReceivers.filter((receiver) => {
            if (forceDistribution) {
                return true;
            }
            const cache = persistentProtocolState.getLastUserProfileDistributionState(
                receiver.view.identity,
            );
            return !(cache?.type === 'profile-picture' && byteEquals(cache.blobId, freshBlobId));
        });
    }

    if (eligibleForSet.length === 0) {
        return {remove, set: undefined, generation};
    }

    // 10. Update the `cache` for each receiver to the blob ID of the distributed profile picture.
    if (commitDistributionCache) {
        for (const receiver of eligibleForSet) {
            persistentProtocolState.setLastUserProfileDistributionState(
                receiver.view.identity,
                {blobId, type: 'profile-picture'},
                new Date(),
            );
        }
    }

    return {
        remove,
        set: {
            contacts: new Set(eligibleForSet),
            blobId,
            key,
            size: currentProfilePicture.blob.byteLength,
        },
        generation,
    };
}
