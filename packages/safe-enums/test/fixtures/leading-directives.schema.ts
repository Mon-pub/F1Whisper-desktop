// @ts-nocheck
/**
 * An enum in a schema that leads with TypeScript directives, and has no imports to separate them
 * from the enum. The directives are copied to the top of the generated module, and are not repeated
 * as the documentation comment of the enum.
 */
export const enum MessageDirection {
    INBOUND = 0,
    OUTBOUND = 1,
}
