import * as os from 'node:os';
import path from 'node:path';
import * as process from 'node:process';

import {base64ToU8a} from '@threema/ts-utils/base64/base64-to-u8a';
import {u8aToBase64} from '@threema/ts-utils/base64/u8a-to-base64';
import {UTF8} from '@threema/ts-utils/codec/utf8';
import type {u53} from '@threema/ts-utils/integer/u53';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as electron from 'electron';
import type {WebContents} from 'electron/main';

import {STATIC_CONFIG} from '~/common/config';
import {TweetNaClBackend} from '~/common/crypto/tweetnacl';
import {
    classifyOppfVerificationError,
    verifyOppfFile,
    type OppfSignatureCheckResult,
} from '~/common/dom/backend/onprem/oppf';
import {readResponseBytes, readSuccessfulResponseBytes} from '~/common/dom/utils/response';
import type {ScreenSharingReminderDetails, ScreenSharingSource} from '~/common/electron-ipc';
import {ScreenSharingReminderIpcCommand} from '~/common/enum';
import type {Logger} from '~/common/logging';
import {ensureSpkiValue, MiB} from '~/common/types';
import {assert, unreachable} from '~/common/utils/assert';
import {createTlsCertificateVerifier} from '~/electron/tls-cert-verifier';

/**
 * A crypto backend used ONLY for Ed25519 signature verification in {@link checkOppFileSignature}
 * (`verifyEd25519Signature` never reads `randomBytes`). Constructing a real CSPRNG-backed instance
 * would be needless work for a verify-only call in the main process, so `randomBytes` throws if
 * ever invoked -- any accidental future reuse of this instance for something requiring real
 * randomness fails loudly instead of silently returning non-random bytes.
 */
const OPPF_SIGNATURE_VERIFICATION_CRYPTO = new TweetNaClBackend((): never => {
    throw new Error('OPPF signature-check crypto backend does not provide randomBytes');
});
const MAX_OPPF_RESPONSE_BYTES: u53 = 4 * MiB;
const DEFAULT_OPPF_REQUEST_TIMEOUT_MS: u53 = 30_000;

// IPC message handler validation
//
// See https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages
// eslint-disable-next-line @typescript-eslint/no-restricted-types
export function validateSenderFrame(senderFrame: Electron.WebFrameMain | null): void {
    if (senderFrame === null) {
        throw new Error('Sender frame was null');
    }
    if (import.meta.env.DEBUG && senderFrame.url.startsWith('http://localhost:')) {
        return;
    }
    if (senderFrame.url.startsWith('threemadesktop://')) {
        return;
    }
    throw new Error(
        `Security violation: Attempt to send IPC message from invalid sender frame: ${senderFrame.url}`,
    );
}

/**
 * Return the path to the platform-specific application data base directory.
 *
 * - Linux / BSD: $XDG_DATA_HOME/F1WhisperDesktop/ or ~/.local/share/F1WhisperDesktop/
 * - macOS: ~/Library/Application Support/F1WhisperDesktop/
 * - Windows: %APPDATA%/F1WhisperDesktop/
 * - Other: ~/.F1WhisperDesktop/
 */
export function getPersistentAppDataBaseDir(): string[] {
    const rootDirectoryName = 'F1WhisperDesktop';
    switch (process.platform) {
        case 'linux':
        case 'freebsd':
        case 'netbsd':
        case 'openbsd':
        case 'sunos': {
            // Note: Don't use dot notation below, see https://stackoverflow.com/a/72403165/284318
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const XDG_DATA_HOME = (process.env['XDG_DATA_HOME'] ?? '').trim();
            if (XDG_DATA_HOME.length > 0) {
                return [XDG_DATA_HOME, rootDirectoryName];
            }
            return [os.homedir(), '.local', 'share', rootDirectoryName];
        }
        case 'darwin':
            return [os.homedir(), 'Library', 'Application Support', rootDirectoryName];
        case 'win32': {
            // Note: Don't use dot notation below, see https://stackoverflow.com/a/72403165/284318
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const appData = process.env['APPDATA'];
            assert(appData !== undefined && appData !== '', '%APPDATA% is undefined or empty');
            return [appData, rootDirectoryName];
        }
        case 'aix':
        case 'android':
        case 'cygwin':
        case 'haiku':
            return [os.homedir(), `.${rootDirectoryName}`];
        default:
            return unreachable(process.platform);
    }
}

export async function showScreenSharingReminder(
    appBaseUrl: URL,
    text: string,
    label: string,
): Promise<electron.BrowserWindow> {
    const display = electron.screen.getPrimaryDisplay();
    const width = 512;
    const browserWindow = new electron.BrowserWindow({
        width,
        height: 2 * 40 + 2 * 8,
        resizable: false,
        frame: false,
        transparent: true,
        x: (display.bounds.width - width) / 2,
        y: 0,
        webPreferences: {
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            preload: path.join(__dirname, '..', 'screenshare-preload', 'screenshare-preload.cjs'),
            webSecurity: true,
            allowRunningInsecureContent: false,
            webgl: false,
            plugins: false,
            experimentalFeatures: false,
            disableBlinkFeatures: [].join(','),
            contextIsolation: true,
            webviewTag: false,
            navigateOnDragDrop: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            enableWebSQL: false,
        },
    });

    return await browserWindow.loadURL(`${new URL('/screenshare.html', appBaseUrl)}`).then(() => {
        browserWindow.setAlwaysOnTop(true, 'floating');
        const details: ScreenSharingReminderDetails = {text, label};
        browserWindow.webContents.send(ScreenSharingReminderIpcCommand.SET_DETAILS, details);
        return browserWindow;
    });
}

export function mapToScreenSharingSources(
    sources: electron.DesktopCapturerSource[],
): ScreenSharingSource[] {
    return sources.map((source) => ({
        appIcon:
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            source.appIcon !== null && !source.appIcon.isEmpty()
                ? source.appIcon.toDataURL()
                : undefined,
        id: source.id,
        name: source.name,
        isScreen: source.id.startsWith('screen'),
        thumbnail: source.thumbnail.toDataURL(),
    }));
}

export async function checkOppFile(
    event: Electron.IpcMainInvokeEvent,
    oppfUrl: string,
    username: string,
    password: string,
    userAgent: string,
    log: Logger,
): Promise<u53> {
    validateSenderFrame(event.senderFrame);

    const session = getIsolatedSession('oppf-fetch', log, event.sender);
    const response = await session.fetch(oppfUrl, {
        method: 'HEAD',
        headers: {
            'authorization': `Basic ${u8aToBase64(UTF8.encode(`${username}:${password}`))}`,
            'user-agent': userAgent,
        },
    });

    return response.status;
}

/**
 * FU-M10: fetch the OPPF over the same isolated session as {@link checkOppFile}/{@link getOppFile},
 * then verify it (Ed25519 signature against the build's trusted signer set, schema, expiry) via the
 * exact same {@link verifyOppfFile} the real bootstrap uses -- so an onboarding connect step can
 * fail fast on an unsupported signer or a malformed/expired file instead of only discovering it
 * later during identity creation/linking. Runs in the main process specifically so the renderer's
 * deliberately narrow crypto surface (no signature verification) does not need to widen.
 *
 * Never throws (except the shared `validateSenderFrame` security-boundary check, which is meant to
 * hard-fail the IPC call like every other handler in this file): every reachable failure mode
 * resolves to a discriminated {@link OppfSignatureCheckResult}, never a rejected promise, so a
 * thrown error's type is never lost crossing the IPC boundary. Returns `{ok: true}` ONLY when the
 * fetch succeeded with a 2xx status AND verification fully succeeded; every other path -- including
 * anything {@link classifyOppfVerificationError} cannot specifically attribute -- resolves
 * `{ok: false}` (fail-closed).
 */
export async function checkOppFileSignature(
    event: Electron.IpcMainInvokeEvent,
    oppfUrl: string,
    username: string,
    password: string,
    userAgent: string,
    log: Logger,
): Promise<OppfSignatureCheckResult> {
    validateSenderFrame(event.senderFrame);

    let binary: ArrayBuffer;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_OPPF_REQUEST_TIMEOUT_MS);
    try {
        const session = getIsolatedSession('oppf-fetch', log, event.sender);
        const response = await session.fetch(oppfUrl, {
            method: 'GET',
            headers: {
                'authorization': `Basic ${u8aToBase64(UTF8.encode(`${username}:${password}`))}`,
                'accept': 'application/json',
                'user-agent': userAgent,
            },
            signal: controller.signal,
        });
        const bytes = await readSuccessfulResponseBytes(response, MAX_OPPF_RESPONSE_BYTES);
        if (bytes === undefined) {
            log.warn(`OPPF signature check: fetch returned status ${response.status}`);
            return {ok: false, reason: 'unreachable'};
        }
        binary = bytes.buffer as ArrayBuffer;
    } catch (error) {
        log.warn('OPPF signature check: fetch failed', error);
        return {ok: false, reason: 'unreachable'};
    } finally {
        clearTimeout(timer);
    }

    try {
        verifyOppfFile(
            {crypto: OPPF_SIGNATURE_VERIFICATION_CRYPTO},
            STATIC_CONFIG.ONPREM_CONFIG_TRUSTED_PUBLIC_KEYS,
            new Uint8Array(binary),
        );
        return {ok: true};
    } catch (error) {
        const reason = classifyOppfVerificationError(error);
        log.warn(`OPPF signature check: verification failed (${reason})`, error);
        return {ok: false, reason};
    }
}

export async function getOppFile(
    event: Electron.IpcMainInvokeEvent,
    oppfUrl: string,
    username: string,
    password: string,
    userAgent: string,
    log: Logger,
    deadlineMs?: u53,
): Promise<ArrayBuffer> {
    validateSenderFrame(event.senderFrame);

    const session = getIsolatedSession('oppf-fetch', log, event.sender);
    const timeoutMs =
        deadlineMs === undefined ? DEFAULT_OPPF_REQUEST_TIMEOUT_MS : deadlineMs - Date.now();
    if (timeoutMs <= 0) {
        throw new Error('OPPF request deadline exceeded before the fetch started');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await session.fetch(oppfUrl, {
            method: 'GET',
            headers: {
                'authorization': `Basic ${u8aToBase64(UTF8.encode(`${username}:${password}`))}`,
                'accept': 'application/json',
                'user-agent': userAgent,
            },
            signal: controller.signal,
        });

        const bytes = await readResponseBytes(response, MAX_OPPF_RESPONSE_BYTES);
        return bytes.buffer as ArrayBuffer;
    } finally {
        clearTimeout(timer);
    }
}

export async function checkFallbackOppFile(
    event: Electron.IpcMainInvokeEvent,
    oppfUrl: string,
    userAgent: string,
    log: Logger,
): Promise<u53> {
    validateSenderFrame(event.senderFrame);

    const session = getIsolatedSession('oppf-fallback-fetch', log, event.sender);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_OPPF_REQUEST_TIMEOUT_MS);
    try {
        const response = await session.fetch(oppfUrl, {
            method: 'HEAD',
            headers: {
                'user-agent': userAgent,
            },
            signal: controller.signal,
        });

        return response.status;
    } finally {
        clearTimeout(timer);
    }
}

export async function getFallbackOppFile(
    event: Electron.IpcMainInvokeEvent,
    oppfUrl: string,
    userAgent: string,
    log: Logger,
): Promise<ArrayBuffer> {
    validateSenderFrame(event.senderFrame);

    const session = getIsolatedSession('oppf-fallback-fetch', log, event.sender);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_OPPF_REQUEST_TIMEOUT_MS);
    try {
        const response = await session.fetch(oppfUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'user-agent': userAgent,
            },
            signal: controller.signal,
        });

        const bytes = await readResponseBytes(response, MAX_OPPF_RESPONSE_BYTES);
        return bytes.buffer as ArrayBuffer;
    } finally {
        clearTimeout(timer);
    }
}

function getIsolatedSession(
    partition: string,
    log: Logger,
    webContents: WebContents,
): Electron.Session {
    const session = electron.session.fromPartition(partition);
    session.setCertificateVerifyProc(
        createTlsCertificateVerifier(
            import.meta.env.TLS_CERTIFICATE_PINS?.map(({fqdn, matchMode, spkis}) => ({
                fqdn,
                matchMode,
                spkis: spkis.map(({algorithm, value}) => ({
                    algorithm,
                    value: ensureSpkiValue(base64ToU8a(value)),
                })),
            })),
            log,
            webContents,
        ),
    );

    return session;
}
