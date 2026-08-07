export function supportsFallbackOppfRecovery(buildEnvironment: string): boolean {
    return buildEnvironment === 'onprem';
}

export class DefaultSessionNetworkGuard {
    private _blockRequests: boolean;
    private _lockedUntilRestart = false;

    public constructor(blockInitially: boolean) {
        this._blockRequests = blockInitially;
    }

    public get isLockedUntilRestart(): boolean {
        return this._lockedUntilRestart;
    }

    /** Enter a terminal external-network lock for the lifetime of this process. */
    public lockUntilRestart(): boolean {
        const isNewLock = !this._lockedUntilRestart;
        this._lockedUntilRestart = true;
        this._blockRequests = true;
        return isNewLock;
    }

    /** Block requests while a non-terminal pin update is validated. */
    public beginPinUpdate(): boolean {
        if (this._lockedUntilRestart) {
            return false;
        }
        this._blockRequests = true;
        return true;
    }

    /** Reopen the session after a successful non-terminal pin update. */
    public completePinUpdate(): void {
        if (!this._lockedUntilRestart) {
            this._blockRequests = false;
        }
    }

    public shouldBlock(url: URL): boolean {
        return (
            this._blockRequests &&
            url.protocol !== 'devtools:' &&
            url.protocol !== 'threemadesktop:' &&
            url.hostname !== 'localhost' &&
            url.hostname !== '127.0.0.1' &&
            url.hostname !== '::1' &&
            url.hostname !== '[::1]'
        );
    }
}
