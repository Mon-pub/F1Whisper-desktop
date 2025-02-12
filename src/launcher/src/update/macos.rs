use std::{
    env, fs,
    io::{Error, ErrorKind},
    path::{Path, PathBuf},
    process::Command,
};

use crate::{
    determine_app_name, print_error, print_log, update::common::find_files_by_extension_in,
    util::fs::validate_file_hash,
};

pub fn validate_and_install_latest_predownloaded_update(
    profile_directory: PathBuf,
) -> Result<(), Error> {
    let app_name = determine_app_name();

    // Find paths to `.dmg` and checksum file.
    let tmp_dir = profile_directory.join("temp");
    let update_dir = tmp_dir.join("update");
    let dmg_file = find_files_by_extension_in(&update_dir, "dmg")
        .first()
        .ok_or(Error::new(ErrorKind::Other, "No DMG file found"))?
        .to_owned();
    let checksum_file = find_files_by_extension_in(&update_dir, "sha256")
        .first()
        .ok_or(Error::new(ErrorKind::Other, "No checksum file found"))?
        .to_owned();
    print_log!("Absolute DMG image path: {}", dmg_file.display());
    print_log!("Absolute checksum file path: {}", checksum_file.display());

    let src_dir = tmp_dir.join(app_name);
    let src_app = src_dir.join(format!("{app_name}.app"));
    let dst_dir = get_current_install_dir()?;
    let dst_app = dst_dir.join(format!("{app_name}.app"));
    print_log!("Absolute source app path: {}", src_app.display());
    print_log!("Absolute destination app path: {}", dst_app.display());

    // Validate `.dmg` image against the checksum.
    validate_file_hash(dmg_file.as_path(), checksum_file.as_path())?;
    print_log!("DMG checksum validation successful");

    // Check if an (older) image is mounted already and unmount.
    if src_dir.exists() {
        print_log!("Looks like last image is still mounted. Will try to unmount...");
        umount_image(&src_dir)?;
    }

    // Mount `.dmg` image.
    mount_image(&dmg_file, &src_dir)?;

    // Install app bundle.
    if has_write_access(&dst_dir) && has_write_access(&dst_app) {
        install_app_unprivileged(&src_app, &dst_app)?;
    } else {
        install_app_privileged(&src_app, &dst_app)?;
    }

    // Unmount `.dmg` image.
    umount_image(&src_dir)?;

    Ok(())
}

fn install_app_unprivileged(src: &PathBuf, dst: &PathBuf) -> Result<(), Error> {
    fs::remove_dir_all(dst)?;

    let result = Command::new("cp")
        .arg("-a")
        .arg(src)
        .arg(dst.parent().unwrap())
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                print_log!("Copy directory successful");
                Ok(())
            } else {
                let error_msg = format!("Failed to copy directory {:?} to {:?}", src, dst);
                Err(Error::new(ErrorKind::Other, error_msg))
            }
        }
        Err(error) => {
            let error_msg = format!("Failed to execute process: {}", error);
            Err(Error::new(ErrorKind::Other, error_msg))
        }
    }
}

fn install_app_privileged(_src: &Path, _dst: &Path) -> Result<(), Error> {
    // TODO(DESK-1752): Implement privileged app update logic for macOS.
    Err(Error::new(
        ErrorKind::Other,
        "Privileged app update not implemented",
    ))
}

fn mount_image(dmg: &PathBuf, mount_point: &PathBuf) -> Result<(), Error> {
    let result = Command::new("hdiutil")
        .arg("attach")
        .arg(dmg)
        .arg("-mountpoint")
        .arg(mount_point)
        .arg("-nobrowse")
        .arg("-quiet")
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                print_log!("Mounting DMG image successful");
                Ok(())
            } else {
                let error_msg = format!("Failed to mount {:?} image", dmg);
                Err(Error::new(ErrorKind::Other, error_msg))
            }
        }
        Err(error) => {
            let error_msg = format!("Failed to execute process: {}", error);
            Err(Error::new(ErrorKind::Other, error_msg))
        }
    }
}

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
                print_log!("Unmounting DMG image successful");
                Ok(())
            } else {
                let error_msg = format!("Failed to unmount {:?}", path);
                Err(Error::new(ErrorKind::Other, error_msg))
            }
        }
        Err(error) => {
            let error_msg = format!("Failed to execute process: {}", error);
            Err(Error::new(ErrorKind::Other, error_msg))
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
                std::io::ErrorKind::NotFound,
                "The current install directory could not be found",
            )
        })
}

/// Checks whether the current user has write access to the file or directory at the given `path`.
fn has_write_access(path: &PathBuf) -> bool {
    let result = Command::new("test").arg("-w").arg(path).output();

    match result {
        Ok(output) => {
            if output.status.success() {
                print_log!("Current user has write access to: {}", path.display());
                true
            } else {
                print_log!(
                    "Current user does NOT have write access to: {}",
                    path.display()
                );
                false
            }
        }
        Err(error) => {
            print_error!("Write permission check process failed: {}", error);
            false
        }
    }
}
