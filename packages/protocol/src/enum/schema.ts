// Imports available to the generated module. Unreferenced imports are dropped when generating, so
// this block declares what generated code may use, not what it does use.
//
// Note: Keep these imports above the documentation comment below, because comments between the last
// import and the first enum declaration are copied into the generated module.
import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * All enums whose values are defined by the Threema protocol or appear on the wire are declared in
 * this file.
 *
 * Use `pnpm run generate:protocol:safe-enums` to generate safer enum variants from them, which are
 * then imported from `@threema/protocol/enum`.
 *
 * See `packages/safe-enums/README.md` for how to write a schema and for which package owns which
 * enum.
 */

/**
 * Nonce scopes. Defines in which context a nonce must be unique.
 *
 * @generate convert
 */
export enum NonceScope {
    CSP = 0,
    D2D = 1,
}
