//! Protobuf utilities and extensions.
use duplicate::duplicate_item;
use rand::Rng as _;

use crate::{protobuf, utils::debug::Name};

impl<ProtobufMessage: prost::Name> Name for ProtobufMessage {
    const NAME: &'static str = ProtobufMessage::NAME;
}

struct PaddingConstraint {
    /// The minimum amount of total bytes that must always be met by adding padding.
    ///
    /// Should be chosen so that it sufficiently prevents the enclosed content from being guessed, e.g. the
    /// average length of the largest enclosed variant.
    minimum_total_length: u16,

    /// The maximum amount of additional padding bytes that may be added.
    ///
    /// Should be chosen so that it doesn't blow up any length limitations.
    maximum_padding_length: u16,
}
impl PaddingConstraint {
    // The largest possible tag has 29 bits which is 5 bytes in varint encoding (29 bits divided into five 7
    // bit payloads). The largest amount of padding has 16 bits which is 3 bytes in varint encoding (16 bits
    // divided into three 7 bit payloads). Makes 8 bytes.
    const MAX_PADDING_OVERHEAD_LENGTH: usize = 5 + 3;
    const PADDING_VALUE: u8 = 0x33;
}

/// Encode the message with padding to a newly allocated buffer. The padding is ensured to correctly take
/// the total encoded length into account but the varint encoding of the padding tag and length adds at
/// least two and at most eight bytes of variable overhead.
///
/// IMPORTANT: If another field with `padding_tag` exists that was encoded into the buffer, the resulting
/// message may either be deserialized into one or the other depending on the implementation.
fn encode_to_vec_padded<TMessage: prost::Message>(
    message: &TMessage,
    padding_tag: u32,
    constraint: &PaddingConstraint,
) -> Vec<u8> {
    // Generate random padding length
    let mut padding_length: u16 = rand::thread_rng().gen_range(0..constraint.maximum_padding_length);

    // Ensure the resulting data will be clamped to at least `minimum_total_length` bytes
    let message_length = message.encoded_len();
    if message_length
        .checked_add(padding_length as usize)
        .expect("message_length + padding_length should not blow up a usize")
        < constraint.minimum_total_length as usize
    {
        padding_length = constraint
            .minimum_total_length
            .checked_sub(
                message_length
                    .try_into()
                    .expect("message_length must be < minimum_total_length and therefore u32"),
            )
            .expect("minimum_total_length must be > message_length");
    }

    // Encode message
    let mut buffer = Vec::with_capacity(
        message_length
            .checked_add(padding_length as usize)
            .expect("message_length + padding_length should not blow up a usize")
            .checked_add(PaddingConstraint::MAX_PADDING_OVERHEAD_LENGTH)
            .expect(
                "message_length + MAX_PADDING_OVERHEAD_LENGTH + padding_length should not blow up a usize",
            ),
    );
    message.encode_raw(&mut buffer);

    // Encode padding header
    prost::encoding::encode_key(
        padding_tag,
        prost::encoding::WireType::LengthDelimited,
        &mut buffer,
    );
    prost::encoding::encode_varint(padding_length.into(), &mut buffer);

    // Encode padding bytes (33emafill)
    buffer.resize(
        buffer
            .len()
            .checked_add(padding_length as usize)
            .expect("message_length + padding overhead + padding_length should not blow up a usize"),
        PaddingConstraint::PADDING_VALUE,
    );

    buffer
}

/// Post-encoding padding support to a message, so that the padding can be calculated based on the length of
/// the encoded message and appended afterwards.
///
/// TODO(LIB-47): This does not prevent the usage of `.encode_to_vec()`, so it can be easily missed.
/// TODO(LIB-72): Add tests.
pub(crate) trait PaddedMessage: prost::Message {
    /// Encode the message with padding to a newly allocated buffer. The padding is ensured to correctly take
    /// the total encoded length into account but the varint encoding of the padding tag and length adds at
    /// least two and at most eight bytes of variable overhead.
    fn encode_to_vec_padded(&self) -> Vec<u8>
    where
        Self: Sized;
}

#[duplicate_item(
    [
        struct_name [ protobuf::csp_e2e::MessageMetadata ]
        padding_constraint [ PaddingConstraint { minimum_total_length: 32, maximum_padding_length: 64 } ]
    ]
    [
        struct_name [ protobuf::d2d::DeviceInfo ]
        padding_constraint [ PaddingConstraint { minimum_total_length: 64, maximum_padding_length: 128 } ]
    ]
    [
        struct_name [ protobuf::d2d::Envelope ]
        padding_constraint [ PaddingConstraint { minimum_total_length: 64, maximum_padding_length: 512 } ]
    ]
)]
impl PaddedMessage for struct_name {
    fn encode_to_vec_padded(&self) -> Vec<u8> {
        encode_to_vec_padded(self, Self::PADDING_TAG, &padding_constraint)
    }
}

#[cfg(test)]
mod tests {
    use std::vec;

    use duplicate::duplicate_item;
    use prost::Message;
    use rstest::rstest;

    use crate::{
        protobuf::{
            csp_e2e::MessageMetadata,
            d2d::{self, DeviceInfo, Envelope},
            d2d_sync::{
                Contact, ConversationCategory, ConversationVisibility, contact as protobuf_contact,
                contact::{
                    AcquaintanceLevel, ActivityState, IdentityType, SyncState, TypingIndicatorPolicyOverride,
                    VerificationLevel, WorkVerificationLevel,
                },
            },
        },
        utils::protobuf::{PaddedMessage, PaddingConstraint},
    };

    /// Helper trait to get the padding filed from the Messages in the tests.
    trait GetPadding {
        fn get_padding(&mut self) -> &mut Vec<u8>;
    }
    #[duplicate_item(
        struct_name;
        [ MessageMetadata ];
        [ DeviceInfo ];
        [ Envelope ];
    )]
    impl GetPadding for struct_name {
        fn get_padding(&mut self) -> &mut Vec<u8> {
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            &mut self.padding
        }
    }

    // /// Macro to apply `GetPadding` implementation for the given Messages.
    // macro_rules! ImplementGetPadding {
    //     ([$($t:ty),+]) => {
    //         $(impl GetPadding for $t {
    //             fn get_padding(&mut self) -> &mut Vec<u8> {
    //                 #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
    //                 &mut self.padding
    //             }
    //         })+
    //     }
    // }
    // // Implement `GetPadding` trait for the given Messages.
    // ImplementGetPadding! {[MessageMetadata, DeviceInfo, Envelope]}

    /// Verify padding of protobuf messages.
    /// - Random padding is added to protobuf messages with field 'padding'.
    /// - Minimum total length `minimum_total_length` for each message is ensured by adding 'padding'.
    /// - Padding added should not exceed `maximum_padding_length` defined per message.
    /// - Ensure decoding of messages encoded with padding is correct.
    /// - Correct padding value should be used.
    #[rstest]
    #[case(MessageMetadata{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            message_id: 1,
            created_at:5,
            nickname: None,
        },
        PaddingConstraint{minimum_total_length: 32, maximum_padding_length: 64})
        ]
    #[case(MessageMetadata{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            message_id: 1,
            created_at:5,
            nickname: Some("x".repeat(64)),
        },
        PaddingConstraint{minimum_total_length: 32, maximum_padding_length: 64})
        ]
    #[case(MessageMetadata{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            message_id: 1,
            created_at:5,
            nickname: Some(String::new()),
        },
        PaddingConstraint{minimum_total_length: 32, maximum_padding_length: 64})
        ]
    #[case(DeviceInfo{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            platform: 1,
            platform_details: String::from("details"),
            app_version: String::from("v1.1.3"),
            label: String::from("label"),
        },
        PaddingConstraint{minimum_total_length: 64, maximum_padding_length: 128})
        ]
    #[case(DeviceInfo{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            platform: 1,
            platform_details: "dry details".repeat(100),
            app_version: String::from("v1.1.3"),
            label: "a very big label".repeat(64),
        },
        PaddingConstraint{minimum_total_length: 64, maximum_padding_length: 128})
        ]
    #[case(DeviceInfo{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            platform: 1,
            platform_details: String::new(),
            app_version: String::new(),
            label: String::new(),
        },
        PaddingConstraint{minimum_total_length: 64, maximum_padding_length: 128})
        ]
    #[case(Envelope{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            device_id: 1,
            protocol_version: d2d::ProtocolVersion::V03 as u32,
            content: None,
        },
        PaddingConstraint{minimum_total_length: 64, maximum_padding_length: 512})
        ]
    #[case(Envelope{
            #[expect(deprecated, reason = "Will be filled by encode_to_vec_padded")]
            padding: vec![],
            device_id: 1,
            protocol_version: d2d::ProtocolVersion::V03 as u32,
            content: Some(d2d::envelope::Content::ContactSync(
                d2d::ContactSync {
                    action: Some(d2d::contact_sync::Action::Create(
                        d2d::contact_sync::Create {
                            contact: Some(Contact{
                                identity: String::from("ABCDEF01"),
                                public_key: Some([1_u8; 32].to_vec()),
                                created_at: Some(1_u64),
                                first_name: Some(String::from("John")),
                                last_name: Some(String::from("Doe")),
                                nickname: Some(String::from("ElDuderino")),
                                verification_level:
                                    Some(VerificationLevel::FullyVerified.into()),
                                work_verification_level:
                                    Some(WorkVerificationLevel::WorkSubscriptionVerified.into()),
                                identity_type:
                                    Some(IdentityType::Regular.into()),
                                acquaintance_level:
                                    Some(AcquaintanceLevel::Direct.into()),
                                activity_state:
                                    Some(ActivityState::Inactive.into()),
                                feature_mask: Some(0_u64),
                                sync_state: Some(SyncState::Custom.into()),
                                read_receipt_policy_override: None,
                                typing_indicator_policy_override: Some(TypingIndicatorPolicyOverride{r#override: None}),
                                notification_trigger_policy_override: Some(protobuf_contact::NotificationTriggerPolicyOverride{r#override: None}),
                                #[expect(deprecated, reason = "Must be provided until phased out")]
                                deprecated_notification_sound_policy_override: None,
                                conversation_category: Some(ConversationCategory::Default.into()),
                                conversation_visibility: Some(ConversationVisibility::Normal.into()),
                                contact_defined_profile_picture: None,
                                user_defined_profile_picture: None,
                                work_availability_status: None,
                                work_last_full_sync_at: None,
                            })
                        },
                    ))
                }
                )),
        },
        PaddingConstraint{minimum_total_length: 64, maximum_padding_length: 512})
        ]
    fn verify_protobuf_padding<T>(
        #[case] msg: T,
        #[case] padding_constraint: PaddingConstraint,
    ) -> anyhow::Result<()>
    where
        T: PaddedMessage + Message + PartialEq<T> + core::fmt::Debug + Default + GetPadding,
    {
        // Maximum size in bytes of padding values to be added to a message
        let max_padding_length: usize = padding_constraint.maximum_padding_length.into();
        // Minimum size in bytes of a message (including padding)
        let min_total_message_length: usize = padding_constraint.minimum_total_length.into();

        // Message encoded without padding
        let mut encoded_plain = Vec::with_capacity(msg.encoded_len());
        msg.encode_raw(&mut encoded_plain);

        // Message encoded with padding
        let encoded_padded = msg.encode_to_vec_padded();
        assert_ne!(encoded_padded.len(), encoded_plain.len());

        assert!(
            encoded_padded.len() - encoded_plain.len()
                <= max_padding_length + PaddingConstraint::MAX_PADDING_OVERHEAD_LENGTH,
            "The padding added exceeds maximum of {} bytes. Got {} bytes:\n{:?}",
            padding_constraint.maximum_padding_length,
            encoded_padded.len() - encoded_plain.len(),
            encoded_padded,
        );

        // Check for minimum message length
        assert!(
            encoded_padded.len() >= min_total_message_length,
            "Insufficient padding size. Total message size should be at least {} but is {}.",
            min_total_message_length,
            encoded_padded.len()
        );

        // Check content after decoding without padding
        let decoded_plain = T::decode(encoded_plain.as_ref())?;
        assert_eq!(decoded_plain, msg);

        // Check content after decoding with padding
        let mut decoded_padded = T::decode(encoded_padded.as_ref())?;
        assert!(
            decoded_padded.get_padding().len() <= max_padding_length,
            "Padding exceeded maximum length: {}, got: {}",
            padding_constraint.maximum_padding_length,
            decoded_padded.get_padding().len()
        );
        assert!(
            decoded_padded
                .get_padding()
                .iter()
                .all(|&padding| padding == PaddingConstraint::PADDING_VALUE),
            "Wrong padding value. Expected {}, found {:?}",
            PaddingConstraint::PADDING_VALUE,
            decoded_padded
                .get_padding()
                .iter()
                .find(|&padding| *padding != PaddingConstraint::PADDING_VALUE)
        );

        // Clear padding field be able to check decoding of remaining fields
        decoded_padded.get_padding().clear();
        assert_eq!(decoded_padded, msg);
        Ok(())
    }
}
