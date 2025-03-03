use std::io::{Error, ErrorKind};

use objc2_core_foundation::{CFError, CFErrorCopyDescription, CFErrorGetCode, CFString};

/// Creates a new `std::io::Error` object from the given `CFError`, extracting as much error
/// information as possible.
///
/// # Safety
///
/// If the reference in `Some(cf_error)` is not a valid CFError, the behavior is undefined.
pub unsafe fn error_from_cf_error(cf_error: Option<&CFError>, operation_name: &str) -> Error {
    let error = cf_error
        .map(|error| {
            // Safety: Caller needs to ensure that `error` is a valid `CFError`.
            let code = unsafe { CFErrorGetCode(error) };
            // Safety: Follows the "Create rule", and thus returns a `CFRetained<_>` owned by the
            // caller, which implements the `Drop` trait to release the object.
            let description = unsafe { CFErrorCopyDescription(error) }
                .map(|value| value.to_string())
                .unwrap_or("unknown".to_string());

            format!(
                "{} failed with code: {} and error: {}",
                operation_name, code, description
            )
        })
        .unwrap_or(format!("{} failed with error: unknown", operation_name));

    Error::new(ErrorKind::Other, error)
}
