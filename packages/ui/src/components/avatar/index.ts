import Charm from '../../hocs/charms-provider/Charm.svelte';

import AvatarRoot from './Avatar.svelte';

export type {AvatarProps} from './Avatar.svelte';

/**
 * An avatar, with `Avatar.Charm` as its charms (see `Avatar.svelte`).
 */
// Components are named in `PascalCase`, unlike other variables and properties.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export const Avatar = Object.assign(AvatarRoot, {Charm});
