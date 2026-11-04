import Charm from './Charm.svelte';
import CharmsProviderRoot from './CharmsProvider.svelte';

export type {CharmsProviderProps} from './CharmsProvider.svelte';

/**
 * A `CharmsProvider`, with `CharmsProvider.Charm` as a subcomponent.
 */
// Components are named in `PascalCase`, unlike other variables and properties.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CharmsProvider = Object.assign(CharmsProviderRoot, {Charm});
