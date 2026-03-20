/**
 * Types and constants shared between the OPPF mock server and its test client.
 *
 * The SPKI SHA-256 fingerprint of the bundled self-signed TLS certificate is:
 *   qdd9Rdhf1Kib9xS49XcReJiguiFiWviIk3LuAHHH54Q=
 *
 * This fingerprint can be used in OPPF `domains.rules` entries to pin connections to
 * the mock server itself, e.g. when testing the certificate-pin update flow.
 */

/** Port the mock server listens on. */
export const MOCK_SERVER_PORT = 9443 as const;

/** URL path of the regular (authenticated) OPPF file. */
export const OPPF_PATH = '/config.oppf' as const;

/** URL path of the fallback (unauthenticated) OPPF file. */
export const FALLBACK_OPPF_PATH = '/config.fallback.oppf' as const;

/**
 * OPPF payload variants the mock server can serve.
 *
 * - `correct`: Valid OPPF with a valid Ed25519 signature and a non-expired license.
 * - `wrong-signature`: OPPF signed with an untrusted key.
 * - `wrong-pin`: OPPF with a spki value that doesn't match the given server certificate..
 * - `expired-license`: OPPF with a valid signature but a license that expired in 1970.
 * - `too-long-pin`: OPPF with a spki value longer than 32 bytes.
 * - `invalid-base64-pin`: OPPF with a spki value that isn't valid base64.
 */
export type OppfVariant =
    | 'correct'
    | 'wrong-signature'
    | 'wrong-pin'
    | 'expired-license'
    | 'too-long-pin'
    | 'invalid-base64-pin';

/** Configuration for the regular (Basic-auth-protected) OPPF endpoint. */
export interface RegularOppfConfig {
    /** OPPF payload variant to serve. Default: `'correct'`. */
    readonly variant: OppfVariant;
    /** HTTP status code to return. Default: `200`. */
    readonly statusCode: number;
    /** Expected Basic auth username. Default: {@link MOCK_SERVER_DEFAULT_USERNAME}. */
    readonly username: string;
    /** Expected Basic auth password. Default: {@link MOCK_SERVER_DEFAULT_PASSWORD}. */
    readonly password: string;
}

/** Configuration for the fallback (unauthenticated) OPPF endpoint. */
export interface FallbackOppfConfig {
    /**
     * Whether the fallback endpoint is currently activated.
     *
     * - `false` (default): returns 404, simulating an endpoint that has not been activated.
     * - `true`: returns the configured `statusCode` (default 200) with the OPPF body.
     */
    readonly enabled: boolean;
    /** OPPF payload variant to serve when enabled. Default: `'correct'`. */
    readonly variant: OppfVariant;
    /**
     * HTTP status code to return when enabled. Default: `200`.
     *
     * Set to other codes (e.g. `429`, `500`) to test error handling in
     * {@link recoverCertificatePins}.
     */
    readonly statusCode: number;
}

/** Complete in-memory state of the mock server. */
export interface MockServerState {
    readonly regularOppf: RegularOppfConfig;
    readonly fallbackOppf: FallbackOppfConfig;
}

/**
 * Request body for `PUT /__control/oppf`.
 * All fields are optional; omitted fields retain their current server-side values.
 */
export interface SetRegularOppfRequest {
    readonly variant?: OppfVariant;
    readonly statusCode?: number;
    readonly username?: string;
    readonly password?: string;
}

/**
 * Request body for `PUT /__control/fallback`.
 * All fields are optional; omitted fields retain their current server-side values.
 */
export interface SetFallbackOppfRequest {
    readonly enabled?: boolean;
    readonly variant?: OppfVariant;
    readonly statusCode?: number;
}

/** Response body returned by all successful control API calls. */
export interface ControlApiOkResponse {
    readonly ok: true;
}
