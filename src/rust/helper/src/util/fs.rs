use objc2_foundation::{
    NSFileManager, NSFileManagerItemReplacementOptions, NSSearchPathDirectory,
    NSSearchPathDomainMask, NSString, NSURL,
};
use std::{
    io::{Error, ErrorKind},
    path::Path,
};

/// Replaces the contents of the item at the specified `destination_path` with the new content from
/// the `source_path` in a manner that ensures no data loss occurs (using Apple's Foundation
/// framework). Note: Supports copying off of a `source_path` on another volume, such as a `.dmg`.
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

    // Create a temporary directory on destination's volume as an intermediary. Note: This is needed
    // when copying between different volumes (e.g., a `.dmg`).
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
        print!(
            "Created temporary directory for item at path: {}",
            temp_item_url_as_string
        );
    }

    // Copy item to the temp directory.
    unsafe { file_manager.copyItemAtURL_toURL_error(&source_url, &temp_item_url) }
        .map_err(|error| Error::new(ErrorKind::Other, error.to_string()))?;

    // Atomically replace item at destination path with item from temp path.
    unsafe {
        file_manager.replaceItemAtURL_withItemAtURL_backupItemName_options_resultingItemURL_error(
            &destination_url,
            &temp_item_url,
            Some(&NSString::from_str("backup")),
            NSFileManagerItemReplacementOptions::empty(),
            None,
        )
    }
    .map_err(|error| Error::new(ErrorKind::Other, error.to_string()))
}
