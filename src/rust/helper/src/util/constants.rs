// Apple Team ID which this app is signed by. Important: Must be provided using the `APPLE_TEAM_ID`
// environment variable at compile time, else defaults to a senseless string.
pub const APPLE_TEAM_ID: &str = match option_env!("APPLE_TEAM_ID") {
    Some(value) => value,
    None => "ABCDEFGHIJ",
};
