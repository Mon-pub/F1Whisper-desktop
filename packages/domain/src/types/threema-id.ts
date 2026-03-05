/**
 * A Threema ID is an 8-character alphanumeric identifier for a Threema user.
 *
 * This is a branded string type to prevent accidental use of arbitrary strings
 * where a Threema ID is expected.
 */
export type ThreemaId = string & {readonly brand: 'ThreemaId'};
