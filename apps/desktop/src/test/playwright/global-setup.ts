/**
 * Playwright globalSetup: starts the OnPrem OPPF mock server when
 * TURBO_BUILD_ENVIRONMENT === 'onprem'.
 *
 * Writes the child PID to a temp file so globalTeardown can send SIGTERM.
 * When reusing an existing server (non-CI), writes no PID file so teardown
 * is also a no-op.
 */
import {type ChildProcess, spawn} from 'node:child_process';
import net from 'node:net';

import {TIMER} from '~/common/utils/timer';
import {MOCK_SERVER_PORT} from '~/test/playwright/mocks/onprem-provisioning-server/types';

const GRACEFUL_TIMEOUT_MS = 500;

export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
    if (process.env.TURBO_BUILD_ENVIRONMENT !== 'onprem') {
        return;
    }

    // Store the PID of the process in-memory.
    let child: ChildProcess | undefined = undefined;

    // Path is relative to process.cwd() (apps/desktop/), matching the former webServer command.
    const serverScript = './src/test/playwright/mocks/onprem-provisioning-server/server.ts';

    console.log('[global-setup] Starting OnPrem mock server...');
    child = spawn('node', ['--experimental-strip-types', serverScript], {
        detached: false,
        stdio: 'inherit',
    });

    if (child.pid === undefined) {
        throw new Error('[global-setup] Failed to obtain PID for mock server process.');
    }

    try {
        await waitForPort('127.0.0.1', MOCK_SERVER_PORT, {timeout: 2000});
    } catch (error) {
        // Kill the orphaned child and clean up before re-throwing.
        child.kill('SIGTERM');
        throw error;
    }

    console.log(`[global-setup] OnPrem mock server ready (PID ${child.pid}).`);

    // eslint-disable-next-line consistent-return
    return async () => {
        console.log(`[global-teardown] Sending SIGTERM to mock server (PID ${child.pid})...`);

        child.kill('SIGTERM');
        await waitForPort('127.0.0.1', MOCK_SERVER_PORT, {
            timeout: GRACEFUL_TIMEOUT_MS,
            reverse: true,
        });

        console.log('[global-teardown] Mock server shutdown complete.');
    };
}

/**
 * Polls a TCP port until it matches the desired reachability state.
 *
 * @param host - Hostname or IP address to connect to.
 * @param port - TCP port number to probe.
 * @param timeout - Maximum milliseconds to wait before throwing.
 * @param reverse - When true, waits until the port is unreachable (useful for shutdown probes).
 */
async function waitForPort(
    host: string,
    port: number,
    {timeout, reverse = false}: {timeout: number; reverse?: boolean},
): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const reachable = await new Promise<boolean>((resolve) => {
            let settled = false;
            const sock = net.createConnection({host, port});
            sock.on('connect', () => {
                settled = true;
                sock.destroy();
                resolve(true);
            });
            function fail(): void {
                if (!settled) {
                    settled = true;
                    sock.destroy();
                    resolve(false);
                }
            }
            sock.on('error', fail);
            sock.setTimeout(200, fail);
        });
        if (reachable !== reverse) {
            return;
        }
        await TIMER.sleep(50);
    }
    throw new Error(
        `[global-setup] Timed out after ${timeout}ms waiting for ${host}:${port} to be ${reverse ? 'unreachable' : 'reachable'}`,
    );
}
