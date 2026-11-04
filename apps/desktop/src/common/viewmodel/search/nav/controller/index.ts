import type {u53} from '@threema/ts-utils/integer/u53';

import type {DbContactReceiverLookup} from '~/common/db';
import {TRANSFER_HANDLER} from '~/common/index';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import {type IQueryableStore, WritableStore} from '~/common/utils/store';
import type {ServicesForViewModel} from '~/common/viewmodel';
import {setContactAcquaintanceLevelToDirect} from '~/common/viewmodel/utils/contact';

export interface ISearchViewModelController extends ProxyMarked {
    /**
     * Triggers a refresh of the search results, even if the search params haven't changed.
     */
    readonly refresh: () => void;
    /**
     * Update the acquaintance level of the contact specified by `lookup`.
     */
    readonly setAcquaintanceLevelDirect: (lookup: DbContactReceiverLookup) => Promise<void>;
    readonly setSearchParams: (params: SearchParams) => void;

    get searchParams(): IQueryableStore<SearchParams | undefined>;
}

export interface SearchParams {
    readonly term: string | undefined;
    readonly limits: {
        /**
         * Limits the maximum amount of conversations to return. If `undefined`, no limit will be
         * applied and all results will be returned.
         */
        readonly conversations: u53 | undefined;
        /**
         * Limits the maximum amount of messages to return. If `undefined`, no limit will be applied
         * and all results will be returned.
         */
        readonly messages: u53 | undefined;
        /**
         * Limits the maximum amount of receivers to return. If `undefined`, no limit will be
         * applied and all results will be returned.
         */
        readonly receivers: u53 | undefined;
    };
}

export class SearchViewModelController implements ISearchViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _currentSearchParamsStore = new WritableStore<SearchParams | undefined>(
        undefined,
    );

    public constructor(private readonly _services: Pick<ServicesForViewModel, 'model'>) {}

    public get searchParams(): IQueryableStore<SearchParams | undefined> {
        return this._currentSearchParamsStore;
    }

    /** @inheritdoc */
    public refresh(): void {
        this._currentSearchParamsStore.update((currentValue) =>
            currentValue === undefined ? undefined : {...currentValue},
        );
    }

    /** @inheritdoc */
    public async setAcquaintanceLevelDirect(lookup: DbContactReceiverLookup): Promise<void> {
        await setContactAcquaintanceLevelToDirect(this._services.model.contacts, lookup);
    }

    public setSearchParams(params: SearchParams): void {
        this._currentSearchParamsStore.set(params);
    }
}
