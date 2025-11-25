export async function hasMicrophone(): Promise<boolean> {
    return (
        (await navigator.mediaDevices.enumerateDevices()).filter(
            (device) => device.kind === 'audioinput',
        ).length > 0
    );
}

export async function getDefaultMicrophone(): Promise<MediaDeviceInfo | undefined> {
    return (await navigator.mediaDevices.enumerateDevices()).find(
        (device) => device.kind === 'audioinput' && device.deviceId === 'default',
    );
}

export async function getFirstMicrophone(): Promise<MediaDeviceInfo | undefined> {
    return (await navigator.mediaDevices.enumerateDevices()).find(
        (device) => device.kind === 'audioinput',
    );
}
