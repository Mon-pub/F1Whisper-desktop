use common::ipc::message::{
    ipc_read_message, ipc_write_message, IPCCommandMessage, IPCResponseMessage,
};
use const_format::formatcp;
use std::{error::Error, ffi::CString};

use tokio::net::UnixStream;

use util::{
    constants::*,
    launchd::{client_matches_code_signature_requirement, unix_listener_for_socket_name},
};

mod util;

/// `SMAuthorizedClients` requirements string, which includes the code signing requirements needed
/// by clients to be allowed to connect to this helper application.
///
/// Note:
/// - Identifier of the connecting application needs to be `ch.threema.threema-desktop`.
/// - The connecting application must be signed with a certificate issued by Apple, and:
///     - Must be of type "Developer ID Application" (`leaf[field.1.2.840.113635.100.6.1.13]`).
///     - The Organization Unit (OU) must be Threema's Team ID.
const SM_AUTHORIZED_CLIENTS: &str = formatcp!(
    r#"identifier "ch.threema.threema-desktop" and anchor apple generic and certificate leaf[subject.OU] = {} and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */"#,
    APPLE_TEAM_ID
);
/// `Info.plist` to embed into the binary.
const PLIST: &[u8] = formatcp!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
            <dict>
                <key>CFBundleIdentifier</key>
                <string>ch.threema.threema-desktop-helper</string>
                <key>CFBundleInfoDictionaryVersion</key>
                <string>6.0</string>
                <key>CFBundleName</key>
                <string>Threema Update Helper</string>
                <key>CFBundleVersion</key>
                <string>1.0.0</string>
                <key>SMAuthorizedClients</key>
                <array>
                    <string>{}</string>
                </array>
            </dict>
        </plist>"#,
        SM_AUTHORIZED_CLIENTS
    ).as_bytes();

// Embed `Info.plist` and `launchd.plist` at compile-time. This is required for macOS to be able to
// determine whether the main application is permitted to register this application as a privileged
// `SMJobBless` helper in the system.
//
// See: https://developer.apple.com/documentation/servicemanagement/smjobbless(_:_:_:_:)#Discussion.
embed_plist::embed_info_plist_bytes!(PLIST);
embed_plist::embed_launchd_plist!("../launchd.plist");

/// `launchd` will automatically invoke this helper application whenever the socket referred in the
/// embedded `launchd.plist` is connected to by a client application. Note: It's the responsibility
/// of the helper to validate whether the respective client is authorized to connect.
#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<(), Box<dyn Error>> {
    println!("IPC: Helper is starting");

    // Listen on socket named "Primary", as defined in `launchd.plist`.
    let socket_name = CString::new("Primary")?;
    let listener = unix_listener_for_socket_name(&socket_name).inspect_err(|error| {
        eprintln!("Error: IPC: Creating listener failed with error: {error}")
    })?;
    println!(
        "IPC: Listener created for socket: {:?}",
        listener.local_addr().unwrap().as_pathname().unwrap()
    );

    while let Ok((client_connection_stream, _)) = listener.accept().await {
        tokio::spawn(handle_client(client_connection_stream));
    }

    println!("IPC: Helper is shutting down");
    Ok(())
}

async fn handle_client(mut client_connection_stream: UnixStream) {
    println!("IPC: Client connected");

    // Immediately disconnect clients that don't match the required code signature.
    if let Err(error) =
        client_matches_code_signature_requirement(&client_connection_stream, SM_AUTHORIZED_CLIENTS)
    {
        eprintln!("Error: IPC: Client code signing validation failed: {error}");
        return;
    };

    let message = ipc_read_message::<IPCCommandMessage>(&mut client_connection_stream).await;
    match message {
        Ok(command) => match command {
            IPCCommandMessage::ReplaceDirectoryAtomic {
                source_path,
                destination_path,
            } => {
                println!("IPC: Command received: ReplaceDirectoryAtomic");

                let result = util::fs::replace_directory_atomic(&source_path, &destination_path);
                if result.is_ok() {
                    println!("IPC: Command successful: ReplaceDirectoryAtomic");
                    println!("    Source path: {}", source_path.display());
                    println!("    Destination path: {}", destination_path.display());

                    let _ =
                        ipc_write_message(&mut client_connection_stream, &IPCResponseMessage::Ok)
                            .await;
                    return;
                };

                eprintln!(
                    "Error: IPC: Command failed: ReplaceDirectoryAtomic: {}",
                    result.err().unwrap()
                );
                eprintln!("    Source path: {}", source_path.display());
                eprintln!("    Destination path: {}", destination_path.display());
            }
        },
        Err(error) => {
            eprintln!("Error: IPC: Failed to read or deserialize message: {error}")
        }
    }
    let _ = ipc_write_message(&mut client_connection_stream, &IPCResponseMessage::Err).await;

    println!("IPC: Client connection closed");
}
