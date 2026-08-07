import {WritableStore} from '~/common/utils/store';

/**
 * How the ongoing 1:1 (o2o) call activity is presented (F1Whisper fork, FU-H09).
 *
 * - `compact`: a small, non-intrusive floating call bar that overlays the normal UI. This is the
 *   default so a call never forces the main layout into an unusable narrow rail.
 * - `expanded`: a full-window overlay with the complete call surface, usable on every layout size.
 */
export type O2oCallPresentation = 'compact' | 'expanded';

/**
 * App-scoped store driving the ongoing-call presentation mode. `App.svelte` sizes the call panel
 * from it; `O2oCallActivity.svelte` reads it to render the matching layout + toggle, and resets it
 * to `compact` when a fresh call is shown. Pure presentation -- no call/controller state lives here.
 */
export const o2oCallPresentationStore = new WritableStore<O2oCallPresentation>('compact');
