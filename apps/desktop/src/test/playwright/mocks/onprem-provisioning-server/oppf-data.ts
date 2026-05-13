/**
 * OPPF payload generation for the mock OnPrem provisioning server.
 *
 * Each OPPF is built as a JSON body and signed at runtime with an Ed25519 keypair loaded from disk
 * (see `signing.ts`). The result is in the OPPF wire format: a UTF-8 JSON body, a newline, then a
 * Base64-encoded 64-byte Ed25519 signature (88 chars).
 *
 * For variants that need to test rejection of untrusted signing keys, callers pass a separate
 * "untrusted" keypair whose public key is not in the build's trusted-keys list.
 */

import {type Ed25519Keypair, signOppfBody} from './signing.ts';
import type {OppfVariant} from './types.ts';

export interface OppfSigningKeypairs {
    /** Keypair whose public key is trusted by the Electron build under test. */
    readonly trusted: Ed25519Keypair;
    /** Keypair whose public key is NOT trusted; used to produce the `wrong-signature` variant. */
    readonly untrusted: Ed25519Keypair;
}

/**
 * Returns the raw OPPF payload string for the given variant, signed at runtime with the
 * appropriate keypair from {@link keypairs}.
 *
 * The returned string is served verbatim as the HTTP response body. The app's `verifyOppfFile`
 * function parses and verifies the embedded signature.
 *
 * @throws If an unknown variant is given.
 */
export function getOppfPayload(variant: OppfVariant, keypairs: OppfSigningKeypairs): string {
    switch (variant) {
        case 'correct':
            return createOppfString({
                spkiValue: 'e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U=',
                keypair: keypairs.trusted,
                licenseExpiry: '2027-02-01',
            });
        case 'expired-license':
            return createOppfString({
                spkiValue: 'e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U=',
                keypair: keypairs.trusted,
                licenseExpiry: '1970-02-01',
            });
        case 'invalid-base64-pin':
            return createOppfString({
                spkiValue: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                keypair: keypairs.trusted,
                licenseExpiry: '2027-02-01',
            });
        case 'too-long-pin':
            return createOppfString({
                spkiValue: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                keypair: keypairs.trusted,
                licenseExpiry: '2027-02-01',
            });
        case 'wrong-pin':
            return createOppfString({
                spkiValue: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                keypair: keypairs.trusted,
                licenseExpiry: '2027-02-01',
            });
        case 'wrong-signature':
            return createOppfString({
                spkiValue: 'e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U=',
                keypair: keypairs.untrusted,
                licenseExpiry: '2027-02-01',
            });
        default:
            throw new Error(`Unknown OPPF variant: ${variant}`);
    }
}

/**
 * Build and sign an OPPF wire payload. The body is serialized as JSON with 4-space indentation,
 * signed with `keypair.secretKey`, and the resulting Base64 signature is appended after a newline.
 */
export function createOppfString(options: {
    readonly keypair: Ed25519Keypair;
    readonly licenseExpiry: string;
    readonly spkiValue: string;
}): string {
    const body = {
        avatar: {url: 'https://devon.3ma.ch/avatar/'},
        blob: {
            uploadUrl: 'https://devon.3ma.ch/blob/upload',
            downloadUrl: 'https://devon.3ma.ch/blob/{blobId}',
            doneUrl: 'https://devon.3ma.ch/blob/{blobId}/done',
        },
        chat: {
            hostname: 'devon.3ma.ch',
            publicKey: 'Q7GorvVQh9L6QVxFxCgh2JaCj1bd/mhJ7+2FkofIPTk=',
            ports: [5222],
        },
        directory: {url: 'https://devon.3ma.ch/directory/'},
        domains: {
            rules: [
                {
                    spkis: [{algorithm: 'sha256', value: options.spkiValue}],
                    fqdn: '*.3ma.ch',
                    matchMode: 'include-subdomains',
                },
            ],
        },
        features: {remoteSecret: {}, aadSync: {}},
        license: {
            expires: options.licenseExpiry,
            count: 10000,
            id: 'opt-o00-4',
        },
        mediator: {
            blob: {
                uploadUrl: 'https://devon.3ma.ch/mediator/blob/upload',
                downloadUrl: 'https://devon.3ma.ch/mediator/blob/{blobId}',
                doneUrl: 'https://devon.3ma.ch/mediator/blob/{blobId}/done',
            },
            url: 'wss://devon.3ma.ch/mediator/',
        },
        refresh: 86400,
        rendezvous: {url: 'wss://devon.3ma.ch/rendezvous/'},
        safe: {url: 'https://devon.3ma.ch/safe/'},
        signatureKey: Buffer.from(options.keypair.publicKey).toString('base64'),
        updates: {desktop: {autoUpdate: true}},
        version: '1.0',
        web: {url: 'https://devon.3ma.ch/web/'},
        work: {url: 'https://devon.3ma.ch/work/'},
    };

    const bodyString = JSON.stringify(body, undefined, 4);
    const bodyBytes = Buffer.from(bodyString, 'utf8');
    const signatureBase64 = signOppfBody(bodyBytes, options.keypair.secretKey);
    return `${bodyString}\n${signatureBase64}`;
}
