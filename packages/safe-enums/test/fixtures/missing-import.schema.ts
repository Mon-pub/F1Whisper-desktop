/**
 * A numeric enum requesting conversion helpers, in a schema that does not import the `u53` the
 * generated code refers to, which is rejected.
 *
 * @generate convert
 */
export const enum MessageDirection {
    INBOUND = 0,
    OUTBOUND = 1,
}
