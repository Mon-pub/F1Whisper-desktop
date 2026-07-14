import {expect} from 'chai';

import {isAllowedPreviewUrl, isBlockedIpAddress} from '~/common/dom/network/link-preview/validator';

/**
 * Exhaustive SSRF / spoofing tests for the sender-side link-preview validator. This is the security
 * crux of the feature: `isAllowedPreviewUrl` is the gate run before fetching AND on every redirect
 * hop (the redirect interceptor calls exactly this predicate per hop, so proving it here proves the
 * open-redirect defense too); `isBlockedIpAddress` is the resolved-IP classifier the fetcher applies
 * to every DNS answer before connecting.
 */
export function run(): void {
    describe('LinkPreviewValidator', function () {
        describe('isBlockedIpAddress (resolved-IP classifier)', function () {
            // Every range the task requires, IPv4.
            const blockedIpv4: readonly [string, string][] = [
                ['0.0.0.0', 'unspecified / this-host'],
                ['0.1.2.3', '0.0.0.0/8'],
                ['10.0.0.1', 'RFC1918 10/8'],
                ['10.255.255.255', 'RFC1918 10/8 upper'],
                ['127.0.0.1', 'loopback'],
                ['127.1.2.3', 'loopback 127/8'],
                ['100.64.0.1', 'CGNAT 100.64/10 lower'],
                ['100.127.255.255', 'CGNAT 100.64/10 upper'],
                ['169.254.0.1', 'link-local 169.254/16'],
                ['169.254.169.254', 'cloud metadata endpoint'],
                ['172.16.0.1', 'RFC1918 172.16/12 lower'],
                ['172.31.255.255', 'RFC1918 172.16/12 upper'],
                ['192.168.0.1', 'RFC1918 192.168/16'],
                ['192.168.1.1', 'RFC1918 192.168/16'],
                ['192.0.0.1', 'IETF 192.0.0/24'],
                ['192.0.2.5', 'TEST-NET-1'],
                ['192.88.99.1', '6to4 relay anycast'],
                ['198.18.0.1', 'benchmarking 198.18/15'],
                ['198.19.255.255', 'benchmarking 198.18/15 upper'],
                ['198.51.100.7', 'TEST-NET-2'],
                ['203.0.113.7', 'TEST-NET-3'],
                ['224.0.0.1', 'multicast 224/4'],
                ['239.255.255.255', 'multicast 224/4 upper'],
                ['240.0.0.1', 'reserved 240/4'],
                ['255.255.255.255', 'broadcast'],
            ];
            for (const [ip, label] of blockedIpv4) {
                it(`blocks IPv4 ${ip} (${label})`, function () {
                    expect(isBlockedIpAddress(ip)).to.equal(true);
                });
            }

            // Public IPv4 that must be ALLOWED.
            const allowedIpv4: readonly string[] = [
                '8.8.8.8',
                '1.1.1.1',
                '93.184.216.34',
                '172.15.255.255', // Just below 172.16/12
                '172.32.0.1', // Just above 172.16/12
                '100.63.255.255', // Just below CGNAT
                '100.128.0.1', // Just above CGNAT
                '192.0.1.1', // Just below 192.0.2 / not 192.0.0
                '198.17.255.255', // Just below benchmarking
                '198.20.0.1', // Just above benchmarking
                '11.0.0.1',
                '126.255.255.255', // Just below loopback
                '128.0.0.1', // Just above loopback
            ];
            for (const ip of allowedIpv4) {
                it(`allows public IPv4 ${ip}`, function () {
                    expect(isBlockedIpAddress(ip)).to.equal(false);
                });
            }

            // Every range the task requires, IPv6.
            const blockedIpv6: readonly [string, string][] = [
                ['::', 'unspecified'],
                ['::1', 'loopback'],
                ['fc00::1', 'ULA fc00::/7 lower'],
                ['fdff:ffff::1', 'ULA fc00::/7 upper'],
                ['fe80::1', 'link-local fe80::/10'],
                ['fe80::dead:beef', 'link-local'],
                ['fec0::1', 'deprecated site-local fec0::/10'],
                ['ff02::1', 'multicast ff00::/8'],
                ['ff00::', 'multicast base'],
                ['2001:db8::1', 'documentation 2001:db8::/32'],
                ['100::1', 'discard-only 100::/64'],
                ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
                ['::ffff:192.168.1.1', 'IPv4-mapped private'],
                ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
                ['::ffff:8.8.8.8', 'IPv4-mapped (any v4-in-v6 is blocked)'],
                ['::127.0.0.1', 'IPv4-compatible loopback'],
            ];
            for (const [ip, label] of blockedIpv6) {
                it(`blocks IPv6 ${ip} (${label})`, function () {
                    expect(isBlockedIpAddress(ip)).to.equal(true);
                });
            }

            // Public IPv6 that must be ALLOWED.
            const allowedIpv6: readonly string[] = [
                '2606:4700:4700::1111', // Cloudflare DNS
                '2001:4860:4860::8888', // Google DNS
                '2a00:1450:4001:81b::200e',
            ];
            for (const ip of allowedIpv6) {
                it(`allows public IPv6 ${ip}`, function () {
                    expect(isBlockedIpAddress(ip)).to.equal(false);
                });
            }

            it('fails closed on an unparseable address', function () {
                expect(isBlockedIpAddress('not-an-ip')).to.equal(true);
                expect(isBlockedIpAddress('999.999.999.999')).to.equal(true);
                expect(isBlockedIpAddress('')).to.equal(true);
                expect(isBlockedIpAddress('1.2.3')).to.equal(true);
                expect(isBlockedIpAddress('1.2.3.4.5')).to.equal(true);
            });

            it('handles bracketed / zone-id IPv6 forms', function () {
                expect(isBlockedIpAddress('[::1]')).to.equal(true);
                expect(isBlockedIpAddress('fe80::1%eth0')).to.equal(true);
                expect(isBlockedIpAddress('[2606:4700:4700::1111]')).to.equal(false);
            });
        });

        describe('isAllowedPreviewUrl (string-level gate, also run per redirect hop)', function () {
            it('allows a normal public https URL', function () {
                expect(isAllowedPreviewUrl('https://signal.org/')).to.equal(true);
                expect(isAllowedPreviewUrl('https://en.wikipedia.org/wiki/SSRF')).to.equal(true);
                expect(isAllowedPreviewUrl('https://sub.domain.co.uk/path?q=1#frag')).to.equal(
                    true,
                );
            });

            describe('scheme', function () {
                const nonHttps: readonly string[] = [
                    'http://signal.org/',
                    'ftp://signal.org/',
                    'file:///etc/passwd',
                    'data:text/html,<script>alert(1)</script>',
                    'blob:https://signal.org/uuid',
                    // eslint-disable-next-line no-script-url
                    'javascript:alert(1)',
                    'gopher://signal.org/',
                    'ws://signal.org/',
                    'HTTP://signal.org/', // Case-insensitive scheme still not https
                ];
                for (const url of nonHttps) {
                    it(`rejects non-https scheme: ${url}`, function () {
                        expect(isAllowedPreviewUrl(url)).to.equal(false);
                    });
                }
            });

            describe('SSRF via IP-literal host (validate-time)', function () {
                const blocked: readonly string[] = [
                    'https://127.0.0.1/',
                    'https://127.0.0.1:8080/admin',
                    'https://0.0.0.0/',
                    'https://10.0.0.1/',
                    'https://172.16.5.4/',
                    'https://192.168.1.1/',
                    'https://169.254.169.254/latest/meta-data/',
                    'https://100.64.0.1/',
                    'https://[::1]/',
                    'https://[fe80::1]/',
                    'https://[fc00::1]/',
                    'https://[::ffff:127.0.0.1]/',
                    'https://[2001:db8::1]/',
                ];
                for (const url of blocked) {
                    it(`rejects IP-literal host: ${url}`, function () {
                        expect(isAllowedPreviewUrl(url)).to.equal(false);
                    });
                }

                it('allows a public IP-literal host', function () {
                    expect(isAllowedPreviewUrl('https://8.8.8.8/')).to.equal(true);
                    expect(isAllowedPreviewUrl('https://[2606:4700:4700::1111]/')).to.equal(true);
                });
            });

            describe('host blocklist', function () {
                const blocked: readonly string[] = [
                    'https://localhost/',
                    'https://localhost:3000/',
                    'https://foo.localhost/',
                    'https://example.com/',
                    'https://www.example.com/',
                    'https://example.net/',
                    'https://example.org/',
                    'https://something.test/',
                    'https://foo.invalid/',
                    'https://abc.onion/',
                    'https://xyz.i2p/',
                ];
                for (const url of blocked) {
                    it(`rejects blocklisted host: ${url}`, function () {
                        expect(isAllowedPreviewUrl(url)).to.equal(false);
                    });
                }
            });

            describe('spoofing / homograph', function () {
                it('rejects directional-override characters', function () {
                    // U+202E RIGHT-TO-LEFT OVERRIDE inside the URL.
                    expect(isAllowedPreviewUrl('https://sign‮al.org/')).to.equal(false);
                    expect(isAllowedPreviewUrl('https://example⁦.com/')).to.equal(false);
                });
                it('rejects box-drawing characters', function () {
                    expect(isAllowedPreviewUrl('https://sig─nal.org/')).to.equal(false);
                });
                it('rejects a mixed ASCII / non-ASCII (homograph) host', function () {
                    // Cyrillic "а" (U+0430) mixed with Latin letters.
                    expect(isAllowedPreviewUrl('https://exаmple.org/')).to.equal(false);
                    expect(isAllowedPreviewUrl('https://pаypal.com/')).to.equal(false);
                });
                it('allows a wholly non-ASCII IDN host', function () {
                    // Pure Cyrillic host (no mixing) is allowed; URL punycode-encodes it.
                    expect(isAllowedPreviewUrl('https://пример.рф/')).to.equal(true);
                });
                it('rejects consecutive dots / ellipsis in host', function () {
                    expect(isAllowedPreviewUrl('https://signal..org/')).to.equal(false);
                });
            });

            describe('credentials / malformed', function () {
                it('rejects embedded credentials', function () {
                    expect(isAllowedPreviewUrl('https://user:pass@signal.org/')).to.equal(false);
                    expect(isAllowedPreviewUrl('https://user@signal.org/')).to.equal(false);
                });
                it('rejects malformed / empty input', function () {
                    expect(isAllowedPreviewUrl(undefined)).to.equal(false);
                    expect(isAllowedPreviewUrl('')).to.equal(false);
                    expect(isAllowedPreviewUrl('not a url')).to.equal(false);
                    expect(isAllowedPreviewUrl('https://')).to.equal(false);
                    expect(isAllowedPreviewUrl('https:///path')).to.equal(false);
                });
            });

            describe('simulated redirect hops (open-redirect SSRF)', function () {
                // The redirect interceptor calls isAllowedPreviewUrl(targetUrl) for each Location.
                // A public start URL that 302s to an internal target must be rejected at the HOP.
                const maliciousRedirectTargets: readonly string[] = [
                    'http://169.254.169.254/latest/meta-data/', // Http downgrade + metadata
                    'https://169.254.169.254/latest/meta-data/',
                    'https://127.0.0.1/admin',
                    'https://10.0.0.1/internal',
                    'https://[::1]/',
                    'https://localhost/',
                    'file:///etc/passwd',
                    'gopher://127.0.0.1:6379/_INFO',
                ];
                for (const target of maliciousRedirectTargets) {
                    it(`a redirect to ${target} is rejected at the hop`, function () {
                        // Simulate the interceptor's per-hop check.
                        expect(isAllowedPreviewUrl(target)).to.equal(false);
                    });
                }
                it('a redirect to another public https URL is allowed at the hop', function () {
                    expect(isAllowedPreviewUrl('https://cdn.signal.org/image.jpg')).to.equal(true);
                });
            });
        });
    });
}
