/**
 * HTTPS mock server for the OnPrem provisioning server (OPPF) endpoints.
 *
 * Run standalone (started by Playwright's `webServer` config):
 *   node --experimental-strip-types server.ts
 *
 * Endpoints:
 *
 *   Regular OPPF (requires Basic auth):
 *     GET  /config.oppf         — Returns the configured OPPF payload.
 *     HEAD /config.oppf         — Returns the status code without a body.
 *
 *   Fallback OPPF (must NOT include an Authorization header):
 *     GET  /config.fallback.oppf — Returns the fallback payload when activated, else 404.
 *     HEAD /config.fallback.oppf — Status check: 200 when activated, 404 when not.
 *
 *   Control API (no auth, used by tests via {@link MockOppfServerClient}):
 *     PUT  /__control/oppf      — Partially override the regular OPPF config.
 *     PUT  /__control/fallback  — Partially override the fallback OPPF config.
 *     POST /__control/reset     — Reset all state to defaults.
 *     GET  /__control/health    — Health check (used by Playwright's webServer readiness probe).
 */

import {execSync} from 'node:child_process';
import * as fs from 'node:fs';
import type {IncomingMessage, ServerResponse} from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';

import * as v from '@badrap/valita';

import {unreachable} from '../../../../common/utils/assert.ts';

import {getOppfPayload} from './oppf-data.ts';
import {
    type FallbackOppfConfig,
    type MockServerState,
    MOCK_SERVER_PORT,
    type RegularOppfConfig,
    type SetFallbackOppfRequest,
    type SetRegularOppfRequest,
} from './types.ts';

const DEFAULT_REGULAR_OPPF: RegularOppfConfig = {
    variant: 'correct',
    statusCode: 200,
    username: 'desktop-endtoend-user1',
    password: '123456789',
};

const DEFAULT_FALLBACK_OPPF: FallbackOppfConfig = {
    enabled: false,
    variant: 'correct',
    statusCode: 200,
};

let serverState: MockServerState = {
    regularOppf: DEFAULT_REGULAR_OPPF,
    fallbackOppf: DEFAULT_FALLBACK_OPPF,
};

function ensureOpenssl(): void {
    try {
        execSync('openssl version', {stdio: 'pipe'});
    } catch {
        throw new Error(
            'openssl is not installed or not found in PATH. ' +
                'Install it before running these tests.',
        );
    }
}

function generateSslCerts(): {key: string; cert: string} {
    const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-certs-'));
    const keyPath = path.join(certDir, 'oppf-key.pem');
    const certPath = path.join(certDir, 'oppf-cert.pem');

    // Generate a self-signed certificate
    execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} ` +
            `-days 1 -nodes -subj "/CN=localhost"`,
        {stdio: 'ignore'},
    );

    const key = fs.readFileSync(keyPath, {encoding: 'utf8'});
    const cert = fs.readFileSync(certPath, {encoding: 'utf8'});

    return {key, cert};
}

function resetState(): void {
    serverState = {
        regularOppf: {...DEFAULT_REGULAR_OPPF},
        fallbackOppf: {...DEFAULT_FALLBACK_OPPF},
    };
}

async function readBody(req: IncomingMessage): Promise<string> {
    return await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });
        req.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', reject);
    });
}

/**
 * Returns `true` if the request carries a valid `Authorization: Basic` header matching
 * the expected `username`:`password` pair.
 */
function hasValidBasicAuth(req: IncomingMessage, username: string, password: string): boolean {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Basic ') !== true) {
        return false;
    }
    const encoded = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
        return false;
    }
    return decoded.slice(0, colonIndex) === username && decoded.slice(colonIndex + 1) === password;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body);
    const length = Buffer.byteLength(payload);
    res.writeHead(statusCode, {'Content-Type': 'application/json', 'Content-Length': length});
    res.end(payload);
}

const REQ_URL_SCHEMA = v.union(
    v.literal('/'),
    v.literal('/config.oppf'),
    v.literal('/config.fallback.oppf'),
    v.literal('/__control/health'),
    v.literal('/__control/reset'),
    v.literal('/__control/oppf'),
    v.literal('/__control/fallback'),
);

/**
 * Writes an OPPF payload response.
 * When `statusCode` is not 200 the body is omitted regardless of method.
 */
function sendOppf(res: ServerResponse, statusCode: number, payload: string): void {
    if (statusCode !== 200) {
        res.end();
        return;
    }

    const bodyBytes = Buffer.from(payload, 'utf8');
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': bodyBytes.byteLength,
    });

    res.end(bodyBytes);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const reqUrl = REQ_URL_SCHEMA.parse(req.url);

        switch (reqUrl) {
            case '/': {
                sendJson(res, 200, 'Welcome to the onprem-provisioning mock server');
                return;
            }
            case '/config.oppf': {
                const {username, password, statusCode, variant} = serverState.regularOppf;
                if (!hasValidBasicAuth(req, username, password)) {
                    res.writeHead(401, {
                        'WWW-Authenticate': 'Basic realm="OnPrem provisioning"',
                    });
                    res.end();
                    return;
                }
                if (req.method === 'HEAD') {
                    res.writeHead(serverState.regularOppf.statusCode);
                    res.end();
                    return;
                }

                sendOppf(res, statusCode, getOppfPayload(variant));
                return;
            }
            case '/config.fallback.oppf': {
                if (req.headers.authorization !== undefined) {
                    // The real OnPrem server returns 400 when an Authorization header is
                    // present on the fallback endpoint. See spki.ts for the corresponding
                    // error-handling branch.
                    res.writeHead(400);
                    res.end();
                    return;
                }
                const {enabled, statusCode} = serverState.fallbackOppf;
                if (!enabled) {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                if (req.method === 'HEAD') {
                    res.writeHead(statusCode);
                    res.end();
                    return;
                }

                sendOppf(res, statusCode, getOppfPayload('correct'));
                return;
            }
            case '/__control/health': {
                if (req.method !== 'GET') {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                sendJson(res, 200, {status: 'ready'});
                return;
            }

            case '/__control/reset': {
                if (req.method !== 'POST') {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                resetState();
                sendJson(res, 200, {ok: true});
                return;
            }
            case '/__control/oppf': {
                if (req.method !== 'PUT') {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                const body = await readBody(req);
                const data = JSON.parse(body) as SetRegularOppfRequest;
                serverState = {
                    ...serverState,
                    regularOppf: {
                        variant: data.variant ?? serverState.regularOppf.variant,
                        statusCode: data.statusCode ?? serverState.regularOppf.statusCode,
                        username: data.username ?? serverState.regularOppf.username,
                        password: data.password ?? serverState.regularOppf.password,
                    },
                };
                sendJson(res, 200, {ok: true});
                return;
            }
            case '/__control/fallback': {
                if (req.method !== 'PUT') {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                const body = await readBody(req);
                const data = JSON.parse(body) as SetFallbackOppfRequest;
                serverState = {
                    ...serverState,
                    fallbackOppf: {
                        enabled: data.enabled ?? serverState.fallbackOppf.enabled,
                        variant: data.variant ?? serverState.fallbackOppf.variant,
                        statusCode: data.statusCode ?? serverState.fallbackOppf.statusCode,
                    },
                };
                sendJson(res, 200, {ok: true});
                return;
            }
            default: {
                unreachable(reqUrl);
            }
        }
    } catch {
        throw new Error('Encountered unknown route');
    }
}

// Make sure that openssl is installed before generating the self-signed ssl key and cert.
ensureOpenssl();
const {key, cert} = generateSslCerts();

const server = https.createServer({cert, key}, (req, res) => {
    handleRequest(req, res)
        .then(() => {
            console.error(
                `[onprem-mock] method=${req.method} url=${req.url} statusCode=${res.statusCode}`,
            );
        })
        .catch((error: unknown) => {
            console.error('[onprem-mock] Unhandled error in request handler:', error);
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });
});

server.listen(MOCK_SERVER_PORT, '127.0.0.1', () => {
    console.log(
        `[onprem-mock] HTTPS mock server listening on https://127.0.0.1:${MOCK_SERVER_PORT}`,
    );
});

process.on('SIGTERM', () => {
    server.close();
});

process.on('SIGINT', () => {
    server.close();
});
