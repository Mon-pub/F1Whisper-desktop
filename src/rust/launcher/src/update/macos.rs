use common::{
    ipc::message::{ipc_read_message, ipc_write_message, IPCCommandMessage, IPCResponseMessage},
    util::macos::error_from_cf_error,
};
use objc2_core_foundation::{CFError, CFRetained, CFString};
use objc2_security::{
    errAuthorizationSuccess, AuthorizationCopyRights, AuthorizationCreate, AuthorizationFlags,
    AuthorizationItem, AuthorizationOpaqueRef, AuthorizationRef, AuthorizationRights,
};
#[allow(deprecated)]
use objc2_service_management::{kSMDomainSystemLaunchd, SMJobBless};
use std::{
    cmp::min,
    env,
    ffi::CString,
    io::{Error, ErrorKind},
    mem::MaybeUninit,
    path::PathBuf,
    process::Command,
    ptr::{self, NonNull},
};
use tokio::{
    net::UnixStream,
    time::{sleep, Duration},
};

use crate::{
    determine_app_name, print_log, update::common::find_files_by_extension_in,
    util::fs::validate_file_hash,
};

/// Path to the IPC socket of the privileged `launchd` helper daemon.
const IPC_SOCKET_PATH: &str = "/var/run/ch.threema.threema-desktop-helper.sock";

/// Validate and install the first DMG image found in "{profile_directory}/temp/update".
///
/// Responsibilities of this function:
/// - Find first `.dmg` and `.dmg.sha256` file in `{profile_directory}/temp/update` (downloaded by
///   the main application).
/// - Verify `.dmg` against checksum to guard against corruption.
/// - Mount `.dmg` to a temporary mount point.
/// - Install `.app` package contained in the mounted `.dmg` using a privileged helper tool.
pub async fn validate_and_install_latest_predownloaded_update(
    profile_directory: PathBuf,
) -> Result<(), Error> {
    let app_name = determine_app_name();

    // Find paths to the downloaded DMG and checksum file in the profile directory.
    let temp_update_directory = profile_directory.join("temp").join("update");
    let dmg = find_files_by_extension_in(&temp_update_directory, "dmg")
        .first()
        .ok_or(Error::new(ErrorKind::Other, "No DMG file found"))?
        .to_owned();
    let checksum = find_files_by_extension_in(&temp_update_directory, "sha256")
        .first()
        .ok_or(Error::new(ErrorKind::Other, "No checksum file found"))?
        .to_owned();
    print_log!("Absolute DMG file path: {}", dmg.display());
    print_log!("Absolute checksum file path: {}", checksum.display());

    let temp_mount_directory = profile_directory.join("temp").join("mount");
    let source_app = temp_mount_directory.join(format!("{app_name}.app"));
    let destination_app = get_current_install_dir()?.join(format!("{app_name}.app"));
    print_log!("Absolute source app path: {}", source_app.display());
    print_log!(
        "Absolute destination app path: {}",
        destination_app.display()
    );

    // Validate DMG against the checksum.
    print_log!("Validating DMG checksum");
    validate_file_hash(dmg.as_path(), checksum.as_path())?;
    print_log!("Checksum validation successful");
    print_log!("Starting update install");

    // Check if an (older) image is mounted already and unmount.
    if temp_mount_directory.exists() {
        print_log!("Looks like last image is still mounted. Will try to unmount...");
        umount_image(&temp_mount_directory)?;
    }

    print_log!("Mounting update image");
    mount_image(&dmg, &temp_mount_directory)?;

    print_log!("Installing update using elevated privileges");
    install_app_privileged(&source_app, &destination_app).await?;

    print_log!("Unmounting update image");
    umount_image(&temp_mount_directory)?;

    Ok(())
}

/// Install the `.app` package at the given `source_path` to the given `destination_path`.
async fn install_app_privileged(
    source_path: &PathBuf,
    destination_path: &PathBuf,
) -> Result<(), Error> {
    // TODO(DESK-1752): Only bless helper if the same version is not already installed.
    print_log!("Requesting authorization to bless helper application");

    // Obtain authorization for blessing helpers by showing an authorization prompt to the user.
    let authorization_ref = authorize_right_with_prompt("com.apple.ServiceManagement.blesshelper")?;
    print_log!("Authorization granted by user");

    // Bless helper application.
    print_log!("Blessing helper daemon using authorization");
    bless_helper("ch.threema.threema-desktop-helper", authorization_ref)?;

    // TODO(DESK-1752): Free authorization.
    // if let Some(set) = NonNull::new(ptr::from_mut(&mut authorization_item_set)) {
    //     unsafe { AuthorizationFreeItemSet(set) };
    // }

    // Helper is blessed, so we can open a connection to the helper socket.
    print_log!("Connecting to helper daemon IPC socket");
    let mut stream = connect_with_retry_backoff(
        IPC_SOCKET_PATH,
        5,
        Duration::from_millis(500),
        Duration::from_secs(5),
    )
    .await?;

    // Send command message and await the response.
    let message = IPCCommandMessage::ReplaceDirectoryAtomic {
        source_path: source_path.to_owned(),
        destination_path: destination_path.to_owned(),
    };
    print_log!("Sending ReplaceDirectoryAtomic command message to helper daemon IPC socket");
    let response = tokio::time::timeout(Duration::from_secs(10), async {
        ipc_write_message(&mut stream, &message).await?;
        ipc_read_message::<IPCResponseMessage>(&mut stream).await
    })
    .await??;

    print_log!("Message response received from helper daemon IPC socket");
    match response {
        IPCResponseMessage::Ok => {
            print_log!("IPC: Command completed successfully");
            Ok(())
        }
        IPCResponseMessage::Err => Err(Error::new(
            ErrorKind::Other,
            "IPC: Error response received from helper",
        )),
    }
}

/// Authorize right with the given `name` using Apple's Security framework. This will display an
/// authentication prompt to the user and ask them to authenticate as an admin.
///
/// # Safety
///
/// Important: The caller must make sure to free the returned `AuthorizationOpaqueRef` using
/// `AuthorizationFree`.
fn authorize_right_with_prompt(name: &str) -> Result<*const AuthorizationOpaqueRef, Error> {
    let authorization_flags = AuthorizationFlags::Defaults
        | AuthorizationFlags::InteractionAllowed
        | AuthorizationFlags::PreAuthorize
        | AuthorizationFlags::ExtendRights;

    // Create authorization object.
    let mut authorization_ref = MaybeUninit::<AuthorizationRef>::uninit();
    // Safety: Follows the "Create rule", and thus `authorization_ref` is owned by the caller.
    // Because the `authorization_ref` is returned from the containing function and we don't retain
    // it (so that it can be freed manually), the responsibility is passed further up (see safety
    // section of the containing function). All other input arguments are constants.
    let status_authorization_create = unsafe {
        AuthorizationCreate(
            ptr::null(),
            ptr::null(),
            authorization_flags,
            authorization_ref.as_mut_ptr(),
        )
    };
    if status_authorization_create != errAuthorizationSuccess {
        return Err(Error::new(
            ErrorKind::Other,
            format!(
                "AuthorizationCreate failed with code: {}",
                status_authorization_create
            ),
        ));
    }

    // Create `AuthorizationItemSet`.
    let authorization_name = CString::new(name)?;
    let authorization_items = [AuthorizationItem {
        name: authorization_name.as_ptr(),
        valueLength: 0,
        value: ptr::null_mut(),
        flags: 0,
    }];
    let mut authorization_item_set = AuthorizationRights {
        count: 1,
        items: authorization_items.as_ptr() as *mut _,
    };

    // Preauthorize.
    let authorization_ref = unsafe { authorization_ref.assume_init() };
    let mut authorized_rights = MaybeUninit::<AuthorizationRights>::uninit();
    let status_authorization_copy_rights = unsafe {
        AuthorizationCopyRights(
            authorization_ref,
            NonNull::new_unchecked(&mut authorization_item_set),
            ptr::null(),
            authorization_flags,
            &mut authorized_rights.as_mut_ptr(),
        )
    };
    if status_authorization_copy_rights != errAuthorizationSuccess {
        return Err(Error::new(
            ErrorKind::Other,
            format!(
                "AuthorizationCopyRights failed with code: {}",
                status_authorization_copy_rights
            ),
        ));
    }

    Ok(authorization_ref)
}

/// Bless a privileged helper application with the given `name` using `SMJobBless`.
fn bless_helper(name: &str, authorization_ref: *const AuthorizationOpaqueRef) -> Result<(), Error> {
    let label = CFString::from_str(name);
    let mut error: *mut CFError = ptr::null_mut();
    let success = unsafe {
        #[allow(deprecated)]
        SMJobBless(
            kSMDomainSystemLaunchd,
            Some(CFRetained::<CFString>::as_ptr(&label).as_ref()),
            authorization_ref,
            &mut error,
        )
    };
    if !success {
        return Err(
            // Safety: `CFError` was produced by `SMJobBless`, so we need to trust that it is valid.
            unsafe { error_from_cf_error(error.as_ref(), "SMJobBless") },
        );
    }

    Ok(())
}

/// Connect to the given `socket_path` (of a unix socket) using an exponential backoff strategy, and
/// return the resulting `UnixStream`.
async fn connect_with_retry_backoff(
    socket_path: &str,
    max_retries: u32,
    initial_delay: Duration,
    max_delay: Duration,
) -> Result<UnixStream, Error> {
    let mut delay = initial_delay;
    let mut attempts = 0;

    loop {
        match UnixStream::connect(socket_path).await {
            Ok(stream) => {
                print_log!("Successfully connected to helper daemon IPC socket");
                return Ok(stream);
            }
            Err(err) => {
                attempts += 1;
                if attempts >= max_retries {
                    print_log!("Failed to connect after {} attempts", attempts);
                    return Err(err);
                }

                print_log!(
                    "Connection attempt {} failed, retrying in {:?}...",
                    attempts,
                    delay
                );
                sleep(delay).await;

                // Increase delay exponentially.
                delay = min(delay * 2, max_delay);
            }
        }
    }
}

/// Mounts the DMG image at the given `path` to the given `mount_path`.
fn mount_image(path: &PathBuf, mount_path: &PathBuf) -> Result<(), Error> {
    let result = Command::new("hdiutil")
        .arg("attach")
        .arg(path)
        .arg("-mountpoint")
        .arg(mount_path)
        .arg("-nobrowse")
        .arg("-quiet")
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                print_log!("Successfully mounted image at path: {}", path.display());
                return Ok(());
            }
            let message = format!(
                "Failed to mount image at path: {} to path: {}",
                path.display(),
                mount_path.display()
            );
            Err(Error::new(ErrorKind::Other, message))
        }
        Err(error) => {
            let message = format!("Mount process failed: {}", error);
            Err(Error::new(ErrorKind::Other, message))
        }
    }
}

/// Unmounts the DMG image mounted at the given `path`.
fn umount_image(path: &PathBuf) -> Result<(), Error> {
    let result = Command::new("hdiutil")
        .arg("detach")
        .arg(path)
        .arg("-quiet")
        .arg("-force")
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                print_log!("Successfully unmounted image at path: {}", path.display());
                return Ok(());
            }
            let message = format!("Failed to unmount image at path: {}", path.display());
            Err(Error::new(ErrorKind::Other, message))
        }
        Err(error) => {
            let message = format!("Unmount process failed: {}", error);
            Err(Error::new(ErrorKind::Other, message))
        }
    }
}

/// Returns the install directory of the app bundle by navigating four directory levels up from the
/// currently running binary (e.g.,
/// `foo/Threema Beta.app/Contents/MacOS/ThreemaDesktopLauncher` -> `foo`).
fn get_current_install_dir() -> Result<PathBuf, Error> {
    env::current_exe()?
        .ancestors()
        .nth(4)
        .map(|path| path.to_path_buf())
        .ok_or_else(|| {
            Error::new(
                ErrorKind::NotFound,
                "Install directory of the app bundle could not be found",
            )
        })
}
