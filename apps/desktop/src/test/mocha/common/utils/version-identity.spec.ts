import type {ClientInfo} from '@threema/libthreema-wasm';
import {expect} from 'chai';

import {STATIC_CONFIG} from '~/common/config';
import {getBrowserInfo, makeCspClientInfo} from '~/common/dom/utils/browser';
import type {SystemInfo} from '~/common/electron-ipc';
import {getClientInfo} from '~/common/network/protocol/task/libthreema/utils';
import {USER_AGENT, withProductUserAgent} from '~/common/user-agent';

/**
 * Bundled at build time (like `migrations.ts` does), so no runtime path is needed.
 */
const ELECTRON_MAIN_SOURCES = import.meta.glob<string>('/electron/electron-main.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
});

/**
 * Build-time identity constants, read once. The turbo rule only knows the variables turbo hashes
 * into cache keys; these are vite-defined constants, not process environment.
 */
/* eslint-disable turbo/no-undeclared-env-vars */
const BUILD_VERSION = import.meta.env.BUILD_VERSION;
const BUILD_VARIANT = import.meta.env.BUILD_VARIANT;
const BUILD_TARGET = import.meta.env.BUILD_TARGET;
const F1_RELEASE = import.meta.env.F1_RELEASE;
/* eslint-enable turbo/no-undeclared-env-vars */

/**
 * Remove line and block comments from TypeScript source, leaving string and template literals
 * intact, so structural pins cannot be satisfied (or tripped) by prose in a comment.
 */
function stripComments(source: string): string {
    let out = '';
    let i = 0;
    while (i < source.length) {
        const char = source[i] ?? '';
        const next = source[i + 1];
        if (char === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') {
                i += 1;
            }
        } else if (char === '/' && next === '*') {
            const endIndex = source.indexOf('*/', i + 2);
            i = endIndex === -1 ? source.length : endIndex + 2;
        } else if (char === "'" || char === '"' || char === '`') {
            const quote = char;
            out += char;
            i += 1;
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\') {
                    out += source[i] ?? '';
                    i += 1;
                }
                out += source[i] ?? '';
                i += 1;
            }
            out += quote;
            i += 1;
        } else {
            out += char;
            i += 1;
        }
    }
    return out;
}

/**
 * The server parses the release counter out of the version token, so `-f1.<N>` must be exactly
 * `-f1.` followed by decimal digits and then the end of the token.
 */
const FORK_VERSION_TOKEN = /^(?<version>.+)-f1\.(?<release>[0-9]+)$/u;

/**
 * `<ver>-f1.<N>;Q;<lang>/<cc>;<browser>;<ver>;<os>;<arch>`
 */
const CSP_CLIENT_INFO =
    /^(?<version>[^;]+-f1\.[0-9]+);Q;(?<lang>[^;/]+)\/(?<country>[^;/]+);(?<browser>[^;]+);(?<browserVersion>[^;]+);(?<os>[^;]+);(?<arch>[^;]+)$/u;

const ELECTRON_USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'threema-desktop/2.0 Chrome/138.0.7204.100 Electron/37.2.0 Safari/537.36';

const SYSTEM_INFO: SystemInfo = {
    os: 'linux',
    arch: 'x86_64',
    locale: 'en-US',
    isSafeStorageAvailable: true,
};

/**
 * Narrow libthreema's client info to the desktop variant (what {@link getClientInfo} returns).
 */
function getDesktopClientInfo(userAgent: string): Extract<ClientInfo, {platform: 'desktop'}> {
    const info = withNavigatorUserAgent(userAgent, () => getClientInfo({systemInfo: SYSTEM_INFO}));
    if (info.platform !== 'desktop') {
        throw new Error(`Expected the desktop client info, got ${info.platform}`);
    }
    return info;
}

/**
 * Run `fn` with a `self.navigator.userAgent` (as in a Chromium renderer/worker), then restore.
 */
function withNavigatorUserAgent<T>(userAgent: string, fn: () => T): T {
    const hadSelf = Reflect.has(globalThis, 'self');
    const previousSelf = Reflect.get(globalThis, 'self');
    Reflect.set(globalThis, 'self', {navigator: {userAgent}});
    try {
        return fn();
    } finally {
        if (hadSelf) {
            Reflect.set(globalThis, 'self', previousSelf);
        } else {
            Reflect.deleteProperty(globalThis, 'self');
        }
    }
}

/**
 * Version identity canaries (F1Whisper fork).
 *
 * Four code sites report the product version to our own infrastructure, which parses the
 * `-f1.<N>` release counter to enforce its version floors (the HTTP User-Agent gate and the CSP
 * login gate). Upstream defines each of these WITHOUT the fork suffix, so an upstream merge that
 * takes the upstream side silently turns the whole fleet into an unrecallable cut. Nothing else
 * exercises these sites.
 */
export function run(): void {
    describe('release::version-identity', function () {
        const release = F1_RELEASE;
        const forkSuffix = `-f1.${release}`;

        it('has a positive integer fork release counter and a base version', function () {
            expect(Number.isInteger(release), 'F1_RELEASE integer').to.equal(true);
            expect(release, 'F1_RELEASE positive').to.be.greaterThan(0);
            expect(BUILD_VERSION).to.have.length.greaterThan(0);
            expect(BUILD_VERSION).to.not.contain('-f1.');
        });

        describe('site 1: USER_AGENT (common/user-agent.ts)', function () {
            it('carries the fork release counter in the product version token', function () {
                const token = USER_AGENT.split(' ')[0] ?? '';
                expect(token).to.equal(`F1Whisper-Desktop/${BUILD_VERSION}${forkSuffix}`);
                const parsed = FORK_VERSION_TOKEN.exec(token.slice(token.indexOf('/') + 1));
                expect(parsed?.groups?.release).to.equal(String(release));
            });

            it('names the build variant and target', function () {
                expect(USER_AGENT).to.equal(
                    `F1Whisper-Desktop/${BUILD_VERSION}${forkSuffix} ` +
                        `(${BUILD_VARIANT}, ${BUILD_TARGET})`,
                );
            });

            it('is the value STATIC_CONFIG hands to every HTTP client', function () {
                expect(STATIC_CONFIG.USER_AGENT).to.equal(USER_AGENT);
                expect(STATIC_CONFIG.USER_AGENT).to.contain(forkSuffix);
            });
        });

        describe('site 2: makeCspClientInfo (dom/utils/browser.ts)', function () {
            const browserInfo = getBrowserInfo(ELECTRON_USER_AGENT);

            it('has the exact client-info shape with the fork counter', function () {
                const info = makeCspClientInfo(browserInfo, SYSTEM_INFO);
                expect(info).to.equal(
                    `${BUILD_VERSION}${forkSuffix};Q;en/US;Electron;37;linux;x86_64`,
                );
                const parsed = CSP_CLIENT_INFO.exec(info);
                expect(parsed, `shape of ${info}`).to.not.equal(null);
                expect(parsed?.groups?.version).to.equal(`${BUILD_VERSION}${forkSuffix}`);
            });

            it('keeps seven `;`-separated fields', function () {
                expect(makeCspClientInfo(browserInfo, SYSTEM_INFO).split(';')).to.have.length(7);
            });

            it('pads a region-less locale with `??`', function () {
                const info = makeCspClientInfo(browserInfo, {...SYSTEM_INFO, locale: 'de'});
                expect(info).to.contain(`${forkSuffix};Q;de/??;`);
                expect(CSP_CLIENT_INFO.test(info)).to.equal(true);
            });
        });

        describe('site 3: getClientInfo (libthreema/utils.ts)', function () {
            it('reports the fork version and the desktop platform', function () {
                const info = getDesktopClientInfo(ELECTRON_USER_AGENT);
                expect(info.platform).to.equal('desktop');
                expect(info.version).to.equal(`${BUILD_VERSION}${forkSuffix}`);
                expect(info.locale).to.equal('en-US');
                expect(info.rendererName).to.equal('Electron');
                expect(info.rendererVersion).to.equal('37');
                expect(info.osName).to.equal('linux');
                expect(info.osArchitecture).to.equal('x86_64');
            });

            it('agrees field by field with the CSP client-info string of site 2', function () {
                const info = getDesktopClientInfo(ELECTRON_USER_AGENT);
                const csp = makeCspClientInfo(
                    getBrowserInfo(ELECTRON_USER_AGENT),
                    SYSTEM_INFO,
                ).split(';');
                expect(csp).to.deep.equal([
                    info.version,
                    'Q',
                    info.locale.replace('-', '/'),
                    info.rendererName,
                    info.rendererVersion,
                    info.osName,
                    info.osArchitecture,
                ]);
            });
        });

        describe('site 4: Electron onBeforeSendHeaders interceptor', function () {
            it('replaces the Chromium User-Agent with the product User-Agent', function () {
                const headers = {'User-Agent': ELECTRON_USER_AGENT, 'x-other': 'kept'};
                const rewritten = withProductUserAgent(headers);
                expect(rewritten['User-Agent']).to.equal(USER_AGENT);
                expect(rewritten['User-Agent']).to.contain(forkSuffix);
                expect(rewritten['x-other']).to.equal('kept');
            });

            it('adds the User-Agent when the request had none, without mutating its input', function () {
                const headers: Record<string, string> = {'x-other': 'kept'};
                const rewritten = withProductUserAgent(headers);
                expect(rewritten['User-Agent']).to.equal(USER_AGENT);
                expect(headers).to.deep.equal({'x-other': 'kept'});
            });

            describe('electron-main source pin', function () {
                const source = stripComments(
                    ELECTRON_MAIN_SOURCES['/electron/electron-main.ts'] ?? '',
                );
                expect(source, 'electron-main source loaded').to.have.length.greaterThan(1000);
                const INTERCEPTOR_USES_HELPER =
                    /onBeforeSendHeaders\s*\(\s*\(\s*details\s*,\s*callback\s*\)\s*=>\s*\{[^}]*\bwithProductUserAgent\s*\(\s*details\.requestHeaders\s*\)/u;
                const DIRECT_UA_ASSIGNMENT = /\[\s*['"]User-Agent['"]\s*\]\s*=[^=]/u;

                it('registers the interceptor through withProductUserAgent', function () {
                    expect(source).to.match(INTERCEPTOR_USES_HELPER);
                    expect(source).to.match(
                        /import\s*\{[^}]*\bwithProductUserAgent\b[^}]*\}\s*from\s*'~\/common\/user-agent'/u,
                    );
                });

                it('does not assign the User-Agent header by hand', function () {
                    expect(source).to.not.match(DIRECT_UA_ASSIGNMENT);
                });

                it('the pin detects a regression (red probe fixture)', function () {
                    const regressed = [
                        'session.webRequest.onBeforeSendHeaders((details, callback) => {',
                        "    details.requestHeaders['User-Agent'] = SOMETHING_ELSE;",
                        '    callback({requestHeaders: details.requestHeaders});',
                        '});',
                    ].join('\n');
                    expect(stripComments(regressed)).to.not.match(INTERCEPTOR_USES_HELPER);
                    expect(stripComments(regressed)).to.match(DIRECT_UA_ASSIGNMENT);
                });

                it('stripComments ignores prose in comments (red probe fixture)', function () {
                    const commented = [
                        "// details.requestHeaders['User-Agent'] = USER_AGENT;",
                        'session.webRequest.onBeforeSendHeaders((details, callback) => {',
                        '    callback({requestHeaders: withProductUserAgent(details.requestHeaders)});',
                        '});',
                    ].join('\n');
                    expect(stripComments(commented)).to.not.match(DIRECT_UA_ASSIGNMENT);
                    expect(stripComments(commented)).to.match(INTERCEPTOR_USES_HELPER);
                });
            });
        });
    });
}
