/**
 * Pre-signed OPPF payloads for use in the mock OnPrem provisioning server.
 *
 * Each string is in the OPPF wire format: a UTF-8 JSON body, followed by one or more
 * newline characters, followed by a Base64-encoded 64-byte Ed25519 signature (88 chars).
 *
 * The signatures are baked in and cannot be modified without the Ed25519 private key
 * corresponding to the `signatureKey` embedded in each payload.
 */

import type {OppfVariant} from './types.ts';

/**
 * Returns the raw OPPF payload string for the given variant.
 *
 * The returned string is served verbatim as the HTTP response body. The app's
 * {@link verifyOppfFile} function will parse and verify the embedded signature.
 *
 * @throws {Error} if an unknown variant is given (exhaustiveness guard).
 */
export function getOppfPayload(variant: OppfVariant): string {
    switch (variant) {
        case 'correct':
            return createOppfString({
                spkiValue: 'e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U=',
                licenseExpiry: '2027-02-01',
                signatureKey: '2Z2w75XmizDgIctRqoTkhRGn05oXl6C1oGOPScKTiK8=',
                base64Signature:
                    'TqTV8tTzLBO3IzhzDUvmxcSLd0e91k614jQXBcOxUJ5hwpFzxDhoHcJxQ8DirvAdBwlLps8h1U0DcujNQGPpAQ==',
            });
        case 'wrong-signature':
            return createOppfString({
                spkiValue: 'e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U=',
                licenseExpiry: '2027-02-01',
                signatureKey: 'HStfyR0rndrnv8mYtNJjEqryBDfRQ7iaLk5WSamnkI4=',
                base64Signature:
                    'fExiteI6IWQSaSVzG2/k1SyFurPF4yckDU0uA4XHXmKeQX9+W7qvzXKzWDrLleBJdZbFxjo4VIqFWEaonD4bDA==',
            });
        case 'wrong-pin':
            return createOppfString({
                spkiValue: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                licenseExpiry: '2027-02-01',
                signatureKey: '2Z2w75XmizDgIctRqoTkhRGn05oXl6C1oGOPScKTiK8=',
                base64Signature:
                    'E7sk2PDxZoLtKFGeK9NjVPDictSr7j1U/b0NvLudg/nBFqCt7M347rX1FvCUKt/TCYN5HfXRgBRpGAJ4QWYBCw==',
            });
        case 'expired-license':
            return createOppfString({
                spkiValue: 'e60wJY6o1gwm840F/uvEHL3XXnJzfclhLdefcDkm45U=',
                licenseExpiry: '1970-02-01',
                signatureKey: '2Z2w75XmizDgIctRqoTkhRGn05oXl6C1oGOPScKTiK8=',
                base64Signature:
                    'vaHasVoVnusOOUszB2B9/4OY9YbNsVO0YcWUzm/WfoirmArQjfJ2E75x61MC7J5alRPgj/Fvegvezlp8dgejAQ==',
            });
        case 'too-long-pin':
            return createOppfString({
                spkiValue: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                licenseExpiry: '2027-02-01',
                signatureKey: '2Z2w75XmizDgIctRqoTkhRGn05oXl6C1oGOPScKTiK8=',
                base64Signature:
                    'kQmjXpn54qNjsplfN+8cXBzp5XodjZUhP0C/ZG6dLMXhP8ry3+AB0ZU6W19YIAZov9uGsRIxuosXuipUm51sAA==',
            });
        case 'invalid-base64-pin':
            return createOppfString({
                spkiValue: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                licenseExpiry: '2027-02-01',
                signatureKey: '2Z2w75XmizDgIctRqoTkhRGn05oXl6C1oGOPScKTiK8=',
                base64Signature:
                    'AWkvhjHxqDsmBi2CEvejgLY0zlf13PKA1x+5q3BNCOXP0w9y4sd30sWWPAc6Rz71qJuT6Kqgs+mif12Hd22HCg==',
            });
        default:
            throw new Error(`Unknown OPPF variant: ${variant}`);
    }
}

export function createOppfString(options: {
    spkiValue: string;
    licenseExpiry: string;
    base64Signature: string;
    signatureKey: string;
}): string {
    return `{
    "work": {
        "url": "https://devon.3ma.ch/work/"
    },
    "refresh": 86400,
    "domains": {
        "rules": [
            {
                "spkis": [
                    {
                        "value": "${options.spkiValue}",
                        "algorithm": "sha256"
                    }
                ],
                "fqdn": "*.3ma.ch",
                "matchMode": "include-subdomains"
            }
        ]
    },
    "avatar": {
        "url": "https://devon.3ma.ch/avatar/"
    },
    "updates": {
        "desktop": {
            "autoUpdate": true
        }
    },
    "version": "1.0",
    "directory": {
        "url": "https://devon.3ma.ch/directory/"
    },
    "license": {
        "expires": "${options.licenseExpiry}",
        "count": 10000,
        "id": "opt-o00-4"
    },
    "features": {
        "remoteSecret": {},
        "aadSync": {}
    },
    "blob": {
        "uploadUrl": "https://devon.3ma.ch/blob/upload",
        "downloadUrl": "https://devon.3ma.ch/blob/{blobId}",
        "doneUrl": "https://devon.3ma.ch/blob/{blobId}/done"
    },
    "web": {
        "url": "https://devon.3ma.ch/web/"
    },
    "chat": {
        "hostname": "devon.3ma.ch",
        "publicKey": "Q7GorvVQh9L6QVxFxCgh2JaCj1bd/mhJ7+2FkofIPTk=",
        "ports": [
            5222
        ]
    },
    "signatureKey": "${options.signatureKey}",
    "safe": {
        "url": "https://devon.3ma.ch/safe/"
    },
    "rendezvous": {
        "url": "wss://devon.3ma.ch/rendezvous/"
    },
    "mediator": {
        "blob": {
            "uploadUrl": "https://devon.3ma.ch/mediator/blob/upload",
            "downloadUrl": "https://devon.3ma.ch/mediator/blob/{blobId}",
            "doneUrl": "https://devon.3ma.ch/mediator/blob/{blobId}/done"
        },
        "url": "wss://devon.3ma.ch/mediator/"
    }
}
${options.base64Signature}`;
}
