use common::util::macos::error_from_cf_error;
use libc::{gid_t, mode_t, uid_t};
use objc2::rc::Retained;
use objc2_core_foundation::{
    kCFAllocatorDefault, kCFURLFileSecurityKey, CFError, CFFileSecurity, CFFileSecurityCreate,
    CFFileSecurityGetGroup, CFFileSecurityGetMode, CFFileSecurityGetOwner, CFFileSecuritySetGroup,
    CFFileSecuritySetOwner, CFRetained, CFString, CFURLCopyResourcePropertyForKey,
    CFURLCreateWithFileSystemPath, CFURLEnumeratorCreateForDirectoryURL, CFURLEnumeratorGetNextURL,
    CFURLEnumeratorOptions, CFURLEnumeratorResult, CFURLGetString, CFURLPathStyle,
    CFURLSetResourcePropertyForKey, CFURL,
};
use objc2_foundation::{
    NSFileManager, NSFileManagerItemReplacementOptions, NSSearchPathDirectory,
    NSSearchPathDomainMask, NSString, NSURL,
};
use std::{
    io::{Error, ErrorKind},
    mem::MaybeUninit,
    path::Path,
    ptr::{self, NonNull},
};

pub struct FileSecurityDetails {
    /// UID of the file owner.
    pub owner: uid_t,
    /// GID of the file group.
    pub group: gid_t,
    /// File mode octal.
    pub mode: mode_t,
}

/// Replaces the directory at the specified `destination_path` with the directory at `source_path`
/// in a manner that ensures no data loss occurs (using Apple's Foundation framework), while
/// ensuring that the item at the destination retains the original file permissions, even after
/// having been replaced. Also correctly handles copying off of a `source_path` on another volume,
/// such as a `.dmg`.
///
/// Note: In this context, the term "directory" also includes directory-like items, such as an
/// `.app` package.
pub fn replace_directory_atomic(source_path: &Path, destination_path: &Path) -> Result<(), Error> {
    let file_manager = unsafe { NSFileManager::defaultManager() };

    // Get `NSURL`s for the given directory paths.
    let source_path_str = source_path.to_str().ok_or(Error::new(
        ErrorKind::Other,
        "Could not convert \"source_path\" to a \"&str\"",
    ))?;
    let source_url =
        unsafe { NSURL::fileURLWithPath_isDirectory(&NSString::from_str(source_path_str), true) };
    let destination_path_str = destination_path.to_str().ok_or(Error::new(
        ErrorKind::Other,
        "Could not convert \"destination_path\" to a \"&str\"",
    ))?;
    let destination_url = unsafe {
        NSURL::fileURLWithPath_isDirectory(&NSString::from_str(destination_path_str), true)
    };

    // Get a copy of the destination path's `CFFileSecurity` properties.
    println!("Reading file permissions of destination");
    let destination_url_file_security = copy_cf_file_security(
        // Don't treat as a directory, because we need the URL to the item itself, not its contents.
        &cf_url_from_ns_url(&destination_url, false)?,
    )?;
    let file_security_details = extract_file_security_details(&destination_url_file_security)?;
    println!(
        "File permissions read successfully: Owner: {}, Group: {}, Mode: {}",
        file_security_details.owner, file_security_details.group, file_security_details.mode
    );

    // Create a temporary directory on destination's volume as an intermediary. Note: This is needed
    // when copying between different volumes (e.g., a `.dmg`).
    println!("Creating temporary directory for copy operations");
    let temp_url = unsafe {
        file_manager.URLForDirectory_inDomain_appropriateForURL_create_error(
            NSSearchPathDirectory::ItemReplacementDirectory,
            NSSearchPathDomainMask::UserDomainMask,
            Some(&destination_url),
            true,
        )
    }
    .map_err(|error| Error::new(ErrorKind::Other, error.to_string()))?;
    // Create URL for item inside of the created temp directory.
    let temp_item_url = unsafe {
        temp_url.URLByAppendingPathComponent(&NSString::from_str(
            destination_path
                .file_name()
                .ok_or(Error::new(
                    ErrorKind::Other,
                    "Could not get file name from the given \"destination_path\"",
                ))?
                .to_str()
                .ok_or(Error::new(
                    ErrorKind::Other,
                    "Could not convert file name to a \"&str\"",
                ))?,
        ))
    }
    .ok_or(Error::new(
        ErrorKind::Other,
        "Could not create \"temp_item_url\"",
    ))?;
    if let Some(temp_item_url_as_string) = unsafe { temp_item_url.path() } {
        println!(
            "Created temporary directory for item at path: {}",
            temp_item_url_as_string
        );
    }

    // Copy item to the temp directory.
    println!("Copying item to temporary directory");
    unsafe { file_manager.copyItemAtURL_toURL_error(&source_url, &temp_item_url) }
        .map_err(|error| Error::new(ErrorKind::Other, error.to_string()))?;

    // Override the temporary item's `CFFileSecurity` properties using the ones obtained earlier
    // from the original item.
    let temp_item_cf_url = cf_url_from_ns_url(&temp_item_url, false)?;
    println!("Recursively overriding ownership of item in temporary directory");
    override_directory_owner_and_group_recursive(
        &temp_item_cf_url,
        &destination_url_file_security,
    )?;

    // Atomically replace item at destination path with item from temp path.
    println!("Replace item at destination with item from temporary directory");
    unsafe {
        file_manager.replaceItemAtURL_withItemAtURL_backupItemName_options_resultingItemURL_error(
            &destination_url,
            &temp_item_url,
            Some(&NSString::from_str("backup")),
            // Don't retain any metadata of the original item, because the file permissions have
            // been set manually above.
            NSFileManagerItemReplacementOptions::UsingNewMetadataOnly,
            None,
        )
    }
    .map_err(|error| Error::new(ErrorKind::Other, error.to_string()))
}

/// Retrieves details about the file security properties in the given `cf_file_security` object.
fn extract_file_security_details(
    cf_file_security: &CFRetained<CFFileSecurity>,
) -> Result<FileSecurityDetails, Error> {
    let mut owner: MaybeUninit<uid_t> = MaybeUninit::uninit();
    let mut group: MaybeUninit<gid_t> = MaybeUninit::uninit();
    let mut mode: MaybeUninit<mode_t> = MaybeUninit::uninit();

    // Safety: All inputs and outputs are either primitive, `CFRetained<_>`, or "out-pointers" using
    // `MaybeUninit<_>`. Pointers are only read from after verifying API success below.
    let has_owner = unsafe { CFFileSecurityGetOwner(cf_file_security, owner.as_mut_ptr()) };
    let has_group = unsafe { CFFileSecurityGetGroup(cf_file_security, group.as_mut_ptr()) };
    let has_mode = unsafe { CFFileSecurityGetMode(cf_file_security, mode.as_mut_ptr()) };

    if has_owner && has_group && has_mode {
        return Ok(FileSecurityDetails {
            // Safety: All the values have been initialized successfully, so it's safe to read.
            owner: unsafe { owner.assume_init() },
            group: unsafe { group.assume_init() },
            mode: unsafe { mode.assume_init() },
        });
    }

    Err(Error::new(
        ErrorKind::Other,
        "Failed to extract file security details",
    ))
}

/// Retrieves a copy of the file system object's security information at the given `url` as a
/// `CFFileSecurity` object.
fn copy_cf_file_security(url: &CFRetained<CFURL>) -> Result<CFRetained<CFFileSecurity>, Error> {
    // Safety: Marked `unsafe` due to FFI. Output is `CFRetained<_>`, which implements the `Drop`
    // trait to release the object.
    let mut file_security =
        unsafe { CFFileSecurityCreate(kCFAllocatorDefault) }.ok_or(Error::new(
            ErrorKind::Other,
            "CFFileSecurityCreate failed with error: unknown",
        ))?;
    let mut error: *mut CFError = ptr::null_mut();
    // Safety: The input `url` is `CFRetained<_>`. The resource we want to copy is of type
    // `CFFileSecurity`, as indicated by `kCFURLFileSecurityKey`. The function follows the "Create
    // rule", and thus the object is owned by the caller (which is already covered by
    // `file_security` being retained above, however).
    let success = unsafe {
        CFURLCopyResourcePropertyForKey(
            url,
            kCFURLFileSecurityKey,
            // Safety: Only a generic pointer is accepted as an argument, so a cast is needed.
            // However, if the copy is successful, the allocated object is expected to be of type
            // `CFFileSecurity`.
            &mut file_security as *mut _ as *mut _,
            &mut error,
        )
    };
    if !success {
        return Err(
            // Safety: `CFError` was produced by `CFURLCopyResourcePropertyForKey`, so we need to
            // trust that it is valid.
            unsafe { error_from_cf_error(error.as_ref(), "CFURLCopyResourcePropertyForKey") },
        );
    }

    Ok(file_security)
}

/// Recursively overrides the owner and group of the directory at the given `url`, and all items in
/// it with the ones contained in the given `cf_file_security` object.
///
/// Note: The caller is responsible for ensuring that the given `url` actually points to a
/// directory.
fn override_directory_owner_and_group_recursive(
    url: &CFRetained<CFURL>,
    cf_file_security: &CFRetained<CFFileSecurity>,
) -> Result<(), Error> {
    // Override the owner and group of the directory itself.
    override_owner_and_group(url, cf_file_security)?;
    println!(
        "Recursively overriding ownership for contents of: {}",
        // Safety: Marked `unsafe` due to FFI. Input and output is `CFRetained<_>`, which implements
        // the `Drop` trait to release the object.
        unsafe { CFURLGetString(url) }.unwrap_or(CFString::from_str("unknown"))
    );

    // Create an enumerator for the directory.
    //
    // Safety: Marked `unsafe` due to FFI. Inputs and outputs are either constant or
    // `CFRetained<_>` (which implements the `Drop` trait to release the object).
    let enumerator = unsafe {
        CFURLEnumeratorCreateForDirectoryURL(
            kCFAllocatorDefault,
            Some(url),
            CFURLEnumeratorOptions::DescendRecursively,
            None,
        )
    }
    .ok_or(Error::new(
        ErrorKind::Other,
        "CFURLEnumeratorCreateForDirectoryURL failed with error: unknown",
    ))?;

    let mut current_url: MaybeUninit<*mut CFURL> = MaybeUninit::uninit();
    let mut error: *mut CFError = ptr::null_mut();
    loop {
        // `enumerator` is `CFRetained<_>`, which implements the `Drop` trait to release the object.
        // Function follows the "Get rule", and thus the caller needs to claim ownership of the URL
        // assigned by this function (see below).
        let result = unsafe {
            CFURLEnumeratorGetNextURL(
                &enumerator,
                current_url.as_mut_ptr() as *mut *const _,
                &mut error,
            )
        };

        match result {
            CFURLEnumeratorResult::Success => {
                // Safety: In the success case, `current_url` is expected to be assigned. In each
                // iteration:
                // 1. A new pointer to a `CFURL` is assigned to `current_url` (Note: `current_url`
                //    is a pointer itself, so `*mut *mut CFURL`).
                // 2. The inner pointer is expected to be a `NonNull<CFURL>` at this point, and is
                //    retained.
                // 3. At the end of the iteration, when the `CFRetained<CFURL>` goes out of scope,
                //    it is dropped.
                // 4. In the next iteration, a different `*mut CFURL` is assigned to `current_url`,
                //    and the cycle starts again.
                let url = unsafe {
                    CFRetained::retain(NonNull::<CFURL>::new_unchecked(current_url.assume_init()))
                };

                // Safety: Marked `unsafe` due to FFI. Input and output is `CFRetained<_>`, which
                // implements the `Drop` trait to release the object.
                if let Some(value) = unsafe { CFURLGetString(&url) } {
                    println!("Overriding owner and group of file at URL: {}", value);
                } else {
                    return Err(Error::new(
                        ErrorKind::Other,
                        "CFURLGetString failed with error: unknown",
                    ));
                }

                override_owner_and_group(&url, cf_file_security)?
            }
            CFURLEnumeratorResult::End => {
                // End of enumeration, break the loop.
                break;
            }
            CFURLEnumeratorResult::Error => {
                // Error occurred during enumeration.
                return Err(
                    // Safety: `CFError` was produced by `CFURLEnumeratorGetNextURL`, so we need to
                    // trust that it is valid.
                    unsafe { error_from_cf_error(error.as_ref(), "CFURLEnumeratorGetNextURL") },
                );
            }
            _ => {
                // Unknown result.
                return Err(Error::new(
                    ErrorKind::Other,
                    format!("Unknown enumerator result: {:?}", result),
                ));
            }
        }
    }

    Ok(())
}

/// Overrides the owner and group of the item at the given `url` with the ones contained in the
/// given `cf_file_security` object.
fn override_owner_and_group(
    url: &CFRetained<CFURL>,
    cf_file_security: &CFRetained<CFFileSecurity>,
) -> Result<(), Error> {
    let current_file_security = copy_cf_file_security(url)?;
    let new_file_security_details = extract_file_security_details(cf_file_security)?;

    // Safety: Marked `unsafe` due to FFI. Inputs and outputs are either constant or `CFRetained<_>`
    // (which implements the `Drop` trait to release the object).
    let success_set_owner =
        unsafe { CFFileSecuritySetOwner(&current_file_security, new_file_security_details.owner) };
    let success_set_group =
        unsafe { CFFileSecuritySetGroup(&current_file_security, new_file_security_details.group) };
    if !success_set_owner || !success_set_group {
        return Err(Error::new(ErrorKind::Other, "Failed to set owner or group"));
    }

    // Override the file's `CFFileSecurity` with the modified copy.
    let mut error: *mut CFError = ptr::null_mut();
    // Safety: Marked `unsafe` due to FFI. Inputs and outputs are either constant or `CFRetained<_>`
    // (which implements the `Drop` trait to release the object).
    let success = unsafe {
        CFURLSetResourcePropertyForKey(
            url,
            kCFURLFileSecurityKey,
            Some(&current_file_security),
            &mut error,
        )
    };
    if !success {
        return Err(
            // Safety: `CFError` was produced by `CFURLSetResourcePropertyForKey`, so we need to
            // trust that it is valid.
            unsafe { error_from_cf_error(error.as_ref(), "CFURLSetResourcePropertyForKey") },
        );
    }

    Ok(())
}

/// Creates a new `CFURL` object from the path contained in the given `ns_url`.
fn cf_url_from_ns_url(
    ns_url: &Retained<NSURL>,
    is_directory: bool,
) -> Result<CFRetained<CFURL>, Error> {
    let path: Retained<NSString> = unsafe { ns_url.path() }.ok_or(Error::new(
        ErrorKind::Other,
        "Could not get path from NSURL",
    ))?;

    unsafe {
        CFURLCreateWithFileSystemPath(
            kCFAllocatorDefault,
            Some(&CFString::from_str(path.to_string().as_str())),
            CFURLPathStyle::CFURLPOSIXPathStyle,
            is_directory,
        )
    }
    .ok_or(Error::new(
        ErrorKind::Other,
        "CFURLCreateWithFileSystemPath failed with error: unknown",
    ))
}
