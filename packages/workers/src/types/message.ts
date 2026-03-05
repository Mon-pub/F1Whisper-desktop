/** A generic message type for inter-worker communication. */
export interface WorkerMessage<TType extends string = string, TPayload = unknown> {
    /** The message type discriminator. */
    readonly type: TType;
    /** The message payload. */
    readonly payload: TPayload;
}
