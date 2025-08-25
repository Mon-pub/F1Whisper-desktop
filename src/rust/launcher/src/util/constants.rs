use num_enum::{IntoPrimitive, TryFromPrimitive};

// Compile-time constants
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

// Exit codes
//
// Note: Keep this in sync with exit codes in `electron-main.ts`.
pub const EXIT_CODE_EXIT: i32 = 0;
pub const EXIT_CODE_RESTART: i32 = 8;
pub const EXIT_CODE_DELETE_PROFILE_AND_RESTART: i32 = 9;
pub const EXIT_CODE_RENAME_PROFILE_AND_RESTART: i32 = 10;
pub const EXIT_CODE_RESTART_AND_INSTALL_UPDATE: i32 = 11;
pub const EXIT_CODE_LAUNCHER_ERROR: i32 = 20;

#[repr(i32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, IntoPrimitive, TryFromPrimitive)]
pub enum ExitCodeRestartRemoteSecretError {
    Blocked = 12,
    InvalidState = 13,
    Mismatch = 14,
    NotFound = 15,
    ServerError = 16,
    Timeout = 17,
    NetworkError = 18,
    RateLimitExceeded = 19,
    InvalidCredentials = 20,
}

impl ExitCodeRestartRemoteSecretError {
    pub fn as_cli_flag_value(self) -> &'static str {
        match self {
            Self::InvalidState => "invalid-state",
            Self::ServerError => "server-error",
            Self::Timeout => "timeout",
            Self::NotFound => "not-found",
            Self::Blocked => "blocked",
            Self::Mismatch => "mismatch",
            Self::NetworkError => "network-error",
            Self::RateLimitExceeded => "rate-limit-exceeded",
            Self::InvalidCredentials => "invalid-credentials",
        }
    }
}

// Delays
pub const DELAY_BEFORE_ERROR_EXIT_MS: u64 = 2000;
