/** Basic information about the running Electron application. */
export interface ElectronAppInfo {
    /** The application name as reported by Electron. */
    readonly name: string;
    /** The application version string. */
    readonly version: string;
}
