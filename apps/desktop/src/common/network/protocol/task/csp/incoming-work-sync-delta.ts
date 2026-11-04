import {IdentityType, TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {ContactUpdate} from '~/common/model';
import type * as protobuf from '~/common/network/protobuf';
import type {DeltaType} from '~/common/network/protobuf/validate/csp-e2e/work-sync-delta';
import type {
    ComposableTask,
    ActiveTaskCodecHandle,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {
    ReflectContactSyncTask,
    type ContactSyncUpdateData,
} from '~/common/network/protocol/task/d2d/reflect-contact-sync';
import {transactionCompleted} from '~/common/network/protocol/task/manager';
import type {IdentityString} from '~/common/network/types';
import type {Mutable} from '~/common/types';

interface Change {
    readonly identity: IdentityString;
    readonly update: ContactUpdate;
}

type Changes = Change[] | 'full_work_sync';

/**
 * Receive and process incoming work sync delta messages.
 */
export class IncomingWorkSyncDeltaTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _workSyncDelta: protobuf.validate.csp_e2e.WorkSyncDelta.Type,
    ) {
        this._log = _services.logging.logger(`network.protocol.task.in-work-sync-delta`);
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        const action = this._workSyncDelta.action;

        switch (action) {
            // 3. If action is of variant require_work_sync, schedule a persistent task to make a
            //    full Work Sync.
            case 'requireWorkSync':
                this._fullWorkSync();
                break;

            // 4. If action is of variant apply:
            // 4.1 Run the Work Sync Delta Change Determination Steps with apply.deltas and let
            // changes be the result.
            case 'apply': {
                const deltas = this._workSyncDelta.apply.deltas;
                let changes = this._apply(deltas, handle);

                // 4.2 If changes is a marker that a full Work Sync is required, schedule a
                // persistent task to make a full Work Sync and abort these steps.
                if (changes === 'full_work_sync') {
                    this._fullWorkSync();
                    break;
                }

                // 4.3 If changes is empty, discard the message and abort these steps.
                if (changes.length === 0) {
                    break;
                }

                // 4.4 (MD) Run the following sub-steps:
                // 4.4.1 Begin a transaction with scope WORK_SYNC_DELTA and no precondition.
                const [transactionResult] = await handle.transaction(
                    TransactionScope.WORK_SYNC_DELTA,
                    () => true,
                    async (state_) => {
                        // 4.4.2 Run the Work Sync Delta Change Determination Steps another time and
                        // update changes with the result.
                        changes = this._apply(deltas, handle);

                        // 4.4.3 If changes is a marker that a full Work Sync is required, schedule
                        // a persistent task to make a full Work Sync. Otherwise, reflect all
                        // changes.
                        if (changes === 'full_work_sync') {
                            this._fullWorkSync();
                        } else {
                            const variants: ContactSyncUpdateData[] = changes.map((change) => ({
                                type: 'update-contact-data',
                                identity: change.identity,
                                contact: change.update,
                            }));
                            const task = new ReflectContactSyncTask(
                                this._services,
                                state_,
                                variants,
                            );
                            await task.run(handle);
                        }
                    },
                );
                // 4.4.4 Commit the transaction and await acknowledgement.
                const result = transactionCompleted(transactionResult) ? 'success' : 'aborted';
                this._log.debug(`Transaction ${result}`);

                // 4.5 Apply all changes persistently.
                this._persist(handle, changes);
                break;
            }

            // 5. If action is an unknown variant, log a warning that an unknown Work Sync variant
            //    has been encountered.
            default:
                this._log.warn('An unknown Work Sync variant has been encountered');
        }
    }

    private _apply(deltas: DeltaType[], handle: ActiveTaskCodecHandle<'volatile'>): Changes {
        // 1. Let deltas be a list of WorkSyncDelta.Delta.

        // 2. Let changes be an empty list of change instructions that would be required to apply
        //    all deltas.
        const changes: Change[] = [];

        // 3. For each delta of deltas:
        for (const delta of deltas) {
            // 3.1 If delta.action is of variant contact_sync:
            if (delta.action === 'contactSync') {
                // 3.1.1 If contact_sync.action is of variant update:
                if (delta.contactSync.action === 'update') {
                    // 3.1.1.1  Lookup the contact associated to update.identity and let contact be
                    // the result.
                    const contact = this._services.model.contacts.getByIdentity(
                        delta.contactSync.update.identity,
                    );

                    // 3.1.1.2 If contact is not defined, discard update and continue with the next
                    // delta.
                    if (contact === undefined) {
                        continue;
                    }

                    const contactView = contact.get().view;

                    // 3.1.1.3 If contact is not currently considered a work contact, return that a
                    // full Work Sync is required.
                    if (contactView.identityType !== IdentityType.WORK) {
                        return 'full_work_sync';
                    }

                    // 3.1.1.4 If contact's last full Work Sync timestamp is defined and ≥
                    // delta.applied_at, discard update and continue with the next delta.
                    if (
                        contactView.workLastFullSyncAt !== undefined &&
                        // TODO(DESK-2123): Verify `contactView.workLastFullSyncAt` is updated
                        // correctly when full Work sync is implemented.
                        contactView.workLastFullSyncAt >= delta.appliedAt
                    ) {
                        continue;
                    }

                    // 3.1.1.5 If update does not diverge from the properties of contact, discard
                    // update and continue with the next delta.
                    //
                    // Note: Each property is compared individually. A property that is `undefined`
                    // in the update is "not set" and never diverges, so it is left unchanged; only
                    // defined properties that differ from the contact are collected.
                    const update = delta.contactSync.update;
                    const change: Mutable<Change['update']> = {};
                    if (
                        update.workAvailabilityStatus !== undefined &&
                        (contactView.workAvailabilityStatus?.category !==
                            update.workAvailabilityStatus.category ||
                            contactView.workAvailabilityStatus.description !==
                                update.workAvailabilityStatus.description)
                    ) {
                        change.workAvailabilityStatus = update.workAvailabilityStatus;
                    }
                    if (Object.keys(change).length === 0) {
                        continue;
                    }

                    // 3.1.1.6 Add a change to changes for the necessary changes defined by update
                    // to update the contact in form of a d2d_sync.Contact.
                    changes.push({identity: update.identity, update: change});
                } else {
                    // 3.1.2 If contact_sync.action is an unknown variant, log a warning that an
                    // unknown Work Sync Delta contact action has been encountered.
                    this._log.warn('Unknown Work Sync Delta contact action');
                }
            } else {
                // 3.2 If delta.action is an unknown variant, log a warning that an unknown Work
                // Sync Delta action has been encountered.
                this._log.warn('Unknown Work Sync Delta action');
            }
        }

        return changes;
    }

    private _persist(handle: ActiveTaskCodecHandle<'volatile'>, changes: Changes): void {
        if (changes === 'full_work_sync') {
            return;
        }

        for (const change of changes) {
            const contact = this._services.model.contacts.getByIdentity(change.identity);

            if (contact === undefined) {
                continue;
            }

            contact.get().controller.update.fromSync(handle, change.update);
        }
    }

    private _fullWorkSync(): void {
        // TODO(DESK-2123): Schedule a task to run a full Work sync.
        this._log.warn('Full work sync is not supported yet');
    }
}
