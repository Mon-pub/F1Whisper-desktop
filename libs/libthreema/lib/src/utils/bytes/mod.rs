//! Byte-related utilities.
// TODO(LIB-33): Implement tests for byte-related utilities
mod reader;
mod writer;

use core::ops::Range;

use rand::Rng as _;
pub use reader::*;
pub use writer::*;

use crate::protobuf;

// The largest possible tag has 32 bits which is 5 bytes in varint encoding (32 bits divided into five 7
// bit payloads). The largest amount of padding has 16 bits which is 3 bytes in varint encoding (16 bits
// divided into three 7 bit payloads). Makes 8 bytes.
const MAX_PADDING_OVERHEAD_LENGTH: usize = 5 + 3;

/// Encode the message with padding to a newly allocated buffer. The padding is ensured to correctly take
/// the total encoded length into account but the varint encoding of the padding tag and length adds at
/// least two and at most eight bytes of variable overhead.
///
/// IMPORTANT: If another field with `padding_tag` exists that was encoded into the buffer, the resulting
/// message may either be deserialized into one or the other depending on the implementation.
///
/// While the start of `padding_length_range` determines the desired **minimum amount of total bytes**.
/// The end of `padding_length_range` determines the **maximum amount of additional padding bytes** added
/// to the encoded message.
///
/// The start of `padding_length_range` should be chosen so that it sufficiently prevents the enclosed
/// content from being guessed, e.g. the average length of the largest enclosed variant. Whereas the end
/// of `padding_length_range` should be chosen so that it doesn't blow up any length limitations.
fn encode_to_vec_padded<TMessage: prost::Message>(
    message: &TMessage,
    padding_tag: u32,
    padding_length_range: Range<u16>,
) -> Vec<u8> {
    // Generate random padding length
    let mut padding_length: u16 = rand::thread_rng().gen_range(0..padding_length_range.end);

    // Ensure the resulting data will be clamped to at least `padding_length_range.start` bytes
    let encoded_length = message.encoded_len();
    if encoded_length
        .checked_add(padding_length as usize)
        .expect("encoded_length + padding_length should not blow up a usize")
        < padding_length_range.start as usize
    {
        padding_length = padding_length_range
            .start
            .checked_sub(
                encoded_length
                    .try_into()
                    .expect("encoded_length must be < padding_length_range.start and therefore u32"),
            )
            .expect("padding_length_range.start must be > encoded_length");
    }

    // Encode message
    let mut buffer = Vec::with_capacity(
        encoded_length
            .checked_add(padding_length as usize)
            .expect("encoded_length + padding length should not blow up a usize")
            .checked_add(MAX_PADDING_OVERHEAD_LENGTH)
            .expect(
                "encoded_length + padding length + MAX_PADDING_OVERHEAD_LENGTH should not blow up a usize",
            ),
    );
    message.encode_raw(&mut buffer);

    // Encode padding as protobuf bytes
    prost::encoding::encode_key(
        padding_tag,
        prost::encoding::WireType::LengthDelimited,
        &mut buffer,
    );
    prost::encoding::encode_varint(padding_length.into(), &mut buffer);
    // 33emafill
    buffer.resize(padding_length as usize, 0x33);

    buffer
}

/// Post-encoding padding support to a message, so that the padding can be calculated based on the length of
/// the encoded message and appended afterwards.
///
/// TODO(LIB-47): This does not prevent the usage of `.encode_to_vec()`, so it can be easily missed.
pub(crate) trait ProtobufPaddedMessage: prost::Message {
    /// Encode the message with padding to a newly allocated buffer. The padding is ensured to correctly take
    /// the total encoded length into account but the varint encoding of the padding tag and length adds at
    /// least two and at most eight bytes of variable overhead.
    fn encode_to_vec_padded(&self) -> Vec<u8>
    where
        Self: Sized;
}
impl ProtobufPaddedMessage for protobuf::csp_e2e::MessageMetadata {
    fn encode_to_vec_padded(&self) -> Vec<u8> {
        encode_to_vec_padded(self, Self::PADDING_TAG, 32..64)
    }
}
impl ProtobufPaddedMessage for protobuf::d2d::Envelope {
    fn encode_to_vec_padded(&self) -> Vec<u8> {
        encode_to_vec_padded(self, Self::PADDING_TAG, 64..512)
    }
}
