import type {Snippet} from 'svelte';

export type WithChildren<Props = Record<string, unknown>> = Props & {
    children?: Snippet | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends {children?: any} ? Omit<T, 'children'> : T;
