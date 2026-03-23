import {createHash, X509Certificate} from 'node:crypto';

import type {Request, WebContents} from 'electron';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as electron from 'electron';

import {ElectronIpcCommand} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {DomainCertificatePin} from '~/common/types';
import {byteEquals} from '~/common/utils/byte';

/**
 * The verification results as returned by electron.
 *
 * See docs at https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc
 * for more information.
 */
const VERIFICATION_RESULT = {
    /** Indicates success and disables Certificate Transparency verification. */
    VALID: 0,
    /** Indicates failure. */
    INVALID: -2,
    /** Uses the verification result from chromium. */
    ABORTED: -3,
} as const;

/**
 * The verifier function that can be passed to {@link Electron.session.setCertificateVerifyProc}.
 */
type CertificateVerifier = NonNullable<Parameters<Electron.Session['setCertificateVerifyProc']>[0]>;

/**
 * A per-hostname store of the most recently seen certificate (as a PEM string).
 *
 * The verifier populates this map whenever it successfully processes a TLS
 * handshake for a hostname. The stored data is the raw `request.certificate.data`
 * value (a PEM string) as supplied by Electron.
 *
 * Chromium's network service caches TLS certificate verification results per
 * `{hostname, certificate}` pair, so the verifier callback will NOT be called
 * again for a host whose result is already cached — even after
 * `setCertificateVerifyProc` is replaced. The cert store lets callers
 * re-validate cached certificates against updated pins without relying on the
 * verifier being invoked again.
 *
 * See https://github.com/electron/electron/issues/41448
 */
export type CertificateStore = Map<string, string>;

/**
 * Re-validate every hostname present in {@link certStore} against the given
 * {@link pins}.
 *
 * This is used by the `UPDATE_PUBLIC_KEY_PINS` IPC handler to eagerly detect
 * a pin mismatch for hosts whose TLS verification result has already been
 * cached by Chromium (and therefore the verifier proc would never be called
 * again for them).
 *
 * @returns `true` if every stored certificate passes the new pins (or if the
 *   store contains no entry for a given pinned hostname yet). Returns `false`
 *   as soon as any pinned hostname's stored certificate fails to match.
 */
export function checkPinsAgainstCertStore(
    pins: DomainCertificatePin[],
    certStore: CertificateStore,
    log: Logger,
): boolean {
    for (const [hostname, certData] of certStore) {
        for (const pin of pins) {
            const escapedFqdn = pin.fqdn.replaceAll('.', '\\.');
            const domainRegex =
                pin.matchMode === 'exact'
                    ? new RegExp(`^${escapedFqdn}$`, 'u')
                    : new RegExp(`^${escapedFqdn.replace('*', '[^\\.]*')}$`, 'u');

            if (!domainRegex.test(hostname)) {
                continue;
            }

            const fingerprint = spkiFingerprint(certData, 'sha256');

            if (pin.spkis.some((spki) => byteEquals(fingerprint, spki.value))) {
                log.debug(
                    `Re-validation of cached certificate for ${hostname} passed against updated pins`,
                );
            } else {
                log.error(
                    `Re-validation of cached certificate for ${hostname} failed against updated pins`,
                );
                return false;
            }
        }
    }
    return true;
}

/**
 * Creates a `CertificateVerifier` function that only accepts certificates which match the
 * fingerprints specified in the `certificatePins`.
 *
 * In the case of an OnPrem build, the certificates pin must be passed from the main process after processing the .oppf file.
 * This is done using the {@link ElectronIpcCommand.UPDATE_PUBLIC_KEY_PINS} signal.
 *
 * The returned function can be passed to {@link Electron.session.setCertificateVerifyProc}.
 *
 * **Note on Chromium's cert verification cache**: Chromium caches the result of
 * this verifier per `{hostname, certificate}` pair. Once a result is cached,
 * the verifier will NOT be called again for the same host. To detect pin
 * changes for already-seen hosts, use {@link checkPinsAgainstCertStore} with
 * the shared {@link certStore} after updating pins.
 *
 * @param certificatePins The list of pinned SPKI fingerprints (SHA-256-hashed and Base64-encoded
 *   public keys). Requests that are not pinned, will not be allowed.
 * @param log A logger instance.
 * @param certStore A shared mutable map that the verifier populates with the
 *   most recently seen certificate per hostname. Pass the same instance to
 *   {@link checkPinsAgainstCertStore} when pins are updated.
 */
export function createTlsCertificateVerifier(
    certificatePins: DomainCertificatePin[] | undefined,
    log: Logger,
    webContents: WebContents,
    certStore?: CertificateStore,
): CertificateVerifier {
    // Sanity-checking of certificate pins
    if (certificatePins !== undefined) {
        for (const pin of certificatePins) {
            for (const fingerprint of pin.spkis) {
                const fingerprintBytes = fingerprint.value;
                if (fingerprintBytes.byteLength !== 32) {
                    throw new Error(
                        `Invalid certificate pinning config for "${pin.fqdn}": Fingerprint "${fingerprint.value}" is not 32 bytes`,
                    );
                }
            }
        }
    }

    return (request: Request, callback: (verificationResult: number) => void) => {
        function valid(): void {
            log.debug(`Successfully validated certificate pin for ${request.hostname}`);

            // Record the certificate so that re-validation can be performed
            // if pins are updated while Chromium has already cached this result.
            certStore?.set(request.hostname, request.certificate.data);

            // If certificate is accepted, return `ABORTED` to yield back to the regular
            // verification process in Chromium. (In other words, we don't reject the certificate.
            // If it is generally valid, it will be accepted by Chromium.)
            callback(VERIFICATION_RESULT.ABORTED);
        }

        function invalid(reason: string): void {
            log.error(
                `TLS certificate of host ${request.hostname} couldn't be verified and was rejected. Reason: ${reason}`,
            );

            // Block Chromium from accepting the certificate.
            callback(VERIFICATION_RESULT.INVALID);
        }

        if (
            import.meta.env.BUILD_ENVIRONMENT === 'onprem' &&
            import.meta.env.BUILD_MODE === 'testing' &&
            certificatePins === undefined &&
            !request.isIssuedByKnownRoot
        ) {
            // No pins loaded yet (pre-OPPF fetch). Fully trust the cert so the initial
            // OPPF fetch succeeds even against a self-signed certificate.

            // Store the cert even here so that the subsequent pin check in
            // UPDATE_PUBLIC_KEY_PINS can validate against it.
            certStore?.set(request.hostname, request.certificate.data);
            callback(VERIFICATION_RESULT.VALID);
            return (() => {})();
        }

        // Reject if the certificate is not trusted by Chromium
        if (!request.isIssuedByKnownRoot) {
            return invalid('Not issued by known root');
        }
        if (!['OK', 'net::OK'].includes(request.verificationResult)) {
            return invalid(`Verification result is ${request.verificationResult}`);
        }

        // This is a special case for the connection before the .oppf file is parsed.
        if (import.meta.env.BUILD_ENVIRONMENT === 'onprem' && certificatePins === undefined) {
            return valid();
        }

        if (certificatePins === undefined) {
            return invalid(
                `No certificate pins were specified. This is illegal in non-OnPrem builds`,
            );
        }

        for (const pin of certificatePins) {
            // Skip if the hostname of the request doesn't match the specified domain.
            //
            // The regex is built according to `matchMode`:
            // - `exact`: the FQDN is matched literally (dots escaped, no wildcard expansion).
            // - `include-subdomains`: a leading `*` is expanded to `[^\\.]*` so that
            //   e.g. `*.example.com` matches `foo.example.com` but not `foo.bar.example.com`.
            const escapedFqdn = pin.fqdn.replaceAll('.', '\\.');
            const domainRegex =
                pin.matchMode === 'exact'
                    ? new RegExp(`^${escapedFqdn}$`, 'u')
                    : new RegExp(`^${escapedFqdn.replace('*', '[^\\.]*')}$`, 'u');
            if (!domainRegex.test(request.hostname)) {
                continue;
            }

            // Calculate the SPKI fingerprint for this certificate
            // Note: Here we only allow sha256 but this could change in the future
            const fingerprint = spkiFingerprint(request.certificate.data, 'sha256');

            // Validate fingerprint against configured pins
            if (pin.spkis.some((spki) => byteEquals(fingerprint, spki.value))) {
                return valid();
            }

            electron.ipcMain.emit(ElectronIpcCommand.INVALID_CERTIFICATE_PINS, {
                senderFrame: {
                    url: webContents.getURL(),
                },
            });

            return invalid(
                `Fingerprint ${fingerprint} not found in certificate pins for domain ${pin.fqdn}`,
            );
        }

        log.info(`Not verifying unpinned domain: ${request.hostname}`);
        return valid();
    };
}

/**
 * Extract the DER-encoded SPKI public key from the X509 certificate.
 */
function extractPublicKey(certificatePem: string): Uint8Array {
    const x509 = new X509Certificate(certificatePem);
    return x509.publicKey.export({
        type: 'spki',
        format: 'der',
    });
}

/**
 * Calculate the SPKI public key fingerprint (Base64-encoded) for the specified X509 certificate.
 *
 * See https://datatracker.ietf.org/doc/html/rfc7469#section-2.4
 */
function spkiFingerprint(certificatePem: string, algorithm: 'sha256'): Uint8Array {
    const publicKey = extractPublicKey(certificatePem);
    return createHash(algorithm).update(publicKey).digest();
}
