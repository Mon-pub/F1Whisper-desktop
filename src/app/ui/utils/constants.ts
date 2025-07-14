/** The maximum size of a group name in bytes. */
export const MAX_GROUP_NAME_BYTES = 256;
/** The maximum size of a contact name in bytes. */
export const MAX_CONTACT_NAME_BYTES = 256;
/**
 * The maximum size of a poll in bytes. The protocol actually defines the limit at 6000 bytes but
 * since we cannot accurately calculate the size of a poll in the frontend, we give it some leeway.
 */
export const MAX_POLL_SIZE_BYTES = 5500;
/** The maximum size of a poll (choice) description in bytes. */
export const MAX_POLL_DESCRIPTION_SIZE_BYTES = 256;
/** The maximum number of conversation previews shown in the `ConversationPreviewList`. */
export const MAX_LAZY_CONVERSATION_PREVIEWS = 80;
/** The maximum number of receiver previews shown in the `ReceiverPreviewList`. */
export const MAX_LAZY_RECEIVER_PREVIEWS = 80;
