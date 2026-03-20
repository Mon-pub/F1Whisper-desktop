/**
 * Client for the OPPF mock server's control API.
 *
 * Use this in Playwright tests to configure mock server behaviour before (or during) a
 * test. The client sends requests to the `/__control/*` endpoints over HTTPS, bypassing
 * certificate verification because the server uses a self-signed test certificate.
 *
 * @example
 * ```ts
 * import {mockOppfServer} from '~/test/playwright/mocks/onprem-provisioning-server/client';
 *
 * test.beforeEach(async () => {
 *     await mockOppfServer.reset();
 * });
 *
 * test('serves an expired-license OPPF', async () => {
 *     await mockOppfServer.setOppfVariant('expired-license');
 * });
 * ```
 */
import type {RequestOptions} from 'node:https';
import * as https from 'node:https';

import {
    type ControlApiOkResponse,
    MOCK_SERVER_PORT,
    type OppfVariant,
    type SetFallbackOppfRequest,
    type SetRegularOppfRequest,
} from './types.ts';

/**
 * HTTPS agent that skips certificate verification.
 * Required because the mock server's TLS certificate is self-signed.
 */
const INSECURE_AGENT = new https.Agent({rejectUnauthorized: false});

/**
 * Sends a request to the mock server's control API and resolves with the parsed
 * JSON response body.
 */
async function controlRequest<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
): Promise<T> {
    return await new Promise((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const options: RequestOptions = {
            hostname: '127.0.0.1',
            port: MOCK_SERVER_PORT,
            path,
            method,
            agent: INSECURE_AGENT,
            headers: {
                'Content-Type': 'application/json',
                ...(payload !== undefined
                    ? {'Content-Length': Buffer.byteLength(payload)}
                    : undefined),
            },
        };

        const req = https.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });
            res.on('end', () => {
                const responseText = Buffer.concat(chunks).toString('utf8');
                try {
                    resolve(JSON.parse(responseText) as T);
                } catch {
                    reject(
                        new Error(
                            `[onprem-mock-client] Failed to parse control API response: ${responseText}`,
                        ),
                    );
                }
            });
        });

        req.on('error', reject);

        if (payload !== undefined) {
            req.write(payload);
        }
        req.end();
    });
}

/**
 * Client for configuring the mock OnPrem provisioning server from Playwright tests.
 *
 * An instance is exported as {@link mockOppfServer} for convenience; you can also
 * construct your own if multiple independent configurations are needed.
 */
export class MockOppfServerClient {
    /**
     * Partially override the regular (Basic-auth-protected) OPPF endpoint config.
     * Omitted fields retain their current server-side values.
     *
     * @param config - Fields to update on the regular OPPF endpoint.
     */
    public async setRegularOppf(config: SetRegularOppfRequest): Promise<void> {
        await controlRequest<ControlApiOkResponse>('PUT', '/__control/oppf', config);
    }

    /**
     * Change the OPPF payload variant served by the regular endpoint.
     *
     * @param variant - The payload variant to switch to.
     */
    public async setOppfVariant(variant: OppfVariant): Promise<void> {
        await this.setRegularOppf({variant});
    }

    /**
     * Partially override the fallback (unauthenticated) OPPF endpoint config.
     * Omitted fields retain their current server-side values.
     *
     * @param config - Fields to update on the fallback OPPF endpoint.
     */
    public async setFallbackOppf(config: SetFallbackOppfRequest): Promise<void> {
        await controlRequest<ControlApiOkResponse>('PUT', '/__control/fallback', config);
    }

    /**
     * Activate the fallback endpoint with the given payload variant.
     *
     * Once enabled, `HEAD /config.fallback.oppf` returns 200 and
     * `GET /config.fallback.oppf` returns the OPPF payload.
     *
     * @param variant - OPPF payload to serve. Defaults to `'correct'`.
     */
    public async enableFallback(variant: OppfVariant = 'correct'): Promise<void> {
        await this.setFallbackOppf({enabled: true, variant});
    }

    /**
     * Deactivate the fallback endpoint.
     *
     * Once disabled, both `HEAD` and `GET` requests to `/config.fallback.oppf`
     * return `404`, simulating an endpoint that has not yet been activated by the
     * OnPrem administrator.
     */
    public async disableFallback(): Promise<void> {
        await this.setFallbackOppf({enabled: false});
    }

    /**
     * Reset the server to its default state:
     * - Regular OPPF: `correct` variant, HTTP 200, default credentials.
     * - Fallback OPPF: disabled (returns 404).
     */
    public async reset(): Promise<void> {
        await controlRequest<ControlApiOkResponse>('POST', '/__control/reset');
    }
}

/**
 * Shared {@link MockOppfServerClient} instance for use in tests.
 *
 * Prefer this singleton over constructing your own instance unless you need
 * independent configuration for concurrent test scenarios.
 */
export const mockOppfServer = new MockOppfServerClient();
