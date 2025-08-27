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
    Blocked = 30,
    InvalidState = 31,
    Mismatch = 32,
    NotFound = 33,
    ServerError = 34,
    Timeout = 35,
    NetworkError = 36,
    RateLimitExceeded = 37,
    InvalidCredentials = 38,
    Unknown = 39
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
            Self::Unknown => "unknown",
        }
    }
}

// Delays
pub const DELAY_BEFORE_ERROR_EXIT_MS: u64 = 2000;
