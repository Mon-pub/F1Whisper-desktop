use common::ipc::message::{
    ipc_read_message, ipc_write_message, IPCCommandMessage, IPCResponseMessage,
};
use std::{error::Error, ffi::CString};

use tokio::net::UnixStream;

use util::{
    constants::*,
    launchd::{client_matches_code_signature_requirement, unix_listener_for_socket_name},
};

mod util;

// Embed `Info.plist` and `launchd.plist` at compile-time. This is required for macOS to be able to
// determine whether the main application is permitted to register this application as a privileged
// `SMJobBless` helper in the system.
//
// See: https://developer.apple.com/documentation/servicemanagement/smjobbless(_:_:_:_:)#Discussion.
embed_plist::embed_info_plist_bytes!(INFO_PLIST);
embed_plist::embed_launchd_plist_bytes!(LAUNCHD_PLIST);

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
            IPCCommandMessage::ReplaceAppAtomic {
                source_path,
                destination_path,
            } => {
                println!("IPC: Command received: ReplaceAppAtomic");

                let result = util::fs::replace_app_atomic(
                    &source_path,
                    &destination_path,
                    SM_AUTHORIZED_CLIENTS,
                );
                if result.is_ok() {
                    println!("IPC: Command successful: ReplaceAppAtomic");
                    println!("    Source path: {}", source_path.display());
                    println!("    Destination path: {}", destination_path.display());

                    let _ =
                        ipc_write_message(&mut client_connection_stream, &IPCResponseMessage::Ok)
                            .await;
                    return;
                };

                eprintln!(
                    "Error: IPC: Command failed: ReplaceAppAtomic: {}",
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
