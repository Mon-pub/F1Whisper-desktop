import {expect} from 'chai';

import {
    decodeEntities,
    extractFirstPreviewUrl,
    isReceivedPreviewAllowed,
    parseOpenGraph,
} from '~/common/dom/network/link-preview/parse';

/**
 * Tests for the pure link-preview parsing + receive-side guard helpers.
 */
export function run(): void {
    describe('link-preview parse', function () {
        describe('extractFirstPreviewUrl', function () {
            it('returns the first https URL', function () {
                expect(
                    extractFirstPreviewUrl('see https://signal.org/a and https://example.org/b'),
                ).to.equal('https://signal.org/a');
            });
            it('skips a leading http:// URL and picks the next https one', function () {
                expect(
                    extractFirstPreviewUrl(
                        'http://signal.org/insecure then https://signal.org/secure',
                    ),
                ).to.equal('https://signal.org/secure');
            });
            it('skips a leading blocklisted https URL', function () {
                expect(
                    extractFirstPreviewUrl('https://localhost/x and https://signal.org/ok'),
                ).to.equal('https://signal.org/ok');
            });
            it('skips an internal-IP https URL', function () {
                expect(
                    extractFirstPreviewUrl('https://127.0.0.1/x https://signal.org/ok'),
                ).to.equal('https://signal.org/ok');
            });
            it('strips trailing prose punctuation', function () {
                expect(extractFirstPreviewUrl('look at https://signal.org/page.')).to.equal(
                    'https://signal.org/page',
                );
                expect(extractFirstPreviewUrl('(https://signal.org/page)')).to.equal(
                    'https://signal.org/page',
                );
            });
            it('returns undefined when there is no previewable URL', function () {
                expect(extractFirstPreviewUrl('no links here')).to.equal(undefined);
                expect(extractFirstPreviewUrl('http://only-insecure.example.test/')).to.equal(
                    undefined,
                );
                expect(extractFirstPreviewUrl(undefined)).to.equal(undefined);
                expect(extractFirstPreviewUrl('')).to.equal(undefined);
            });
        });

        describe('isReceivedPreviewAllowed (receive-side anti-injection guard)', function () {
            it('allows when the URL is valid and appears as the first URL in the caption', function () {
                expect(
                    isReceivedPreviewAllowed(
                        'https://signal.org/page',
                        'check https://signal.org/page',
                    ),
                ).to.equal(true);
            });
            it('rejects when the URL is not in the caption (injected card)', function () {
                expect(
                    isReceivedPreviewAllowed(
                        'https://evil.example/x',
                        'check https://signal.org/page',
                    ),
                ).to.equal(false);
            });
            it('rejects when the caption is empty', function () {
                expect(isReceivedPreviewAllowed('https://signal.org/page', undefined)).to.equal(
                    false,
                );
                expect(isReceivedPreviewAllowed('https://signal.org/page', '')).to.equal(false);
            });
            it('rejects when the claimed URL fails the SSRF validator', function () {
                expect(
                    isReceivedPreviewAllowed('https://127.0.0.1/x', 'see https://127.0.0.1/x'),
                ).to.equal(false);
                expect(
                    isReceivedPreviewAllowed('http://signal.org/x', 'see http://signal.org/x'),
                ).to.equal(false);
            });
            it('rejects when the caption previews a DIFFERENT first URL', function () {
                // Caption's first URL is signal.org, but the card claims a (valid) second URL.
                expect(
                    isReceivedPreviewAllowed(
                        'https://other.org/b',
                        'https://signal.org/a then https://other.org/b',
                    ),
                ).to.equal(false);
            });
        });

        describe('parseOpenGraph', function () {
            it('extracts og:title / og:description / og:image', function () {
                const html = `<html><head>
                    <meta property="og:title" content="Hello &amp; World">
                    <meta property="og:description" content="A description">
                    <meta property="og:image" content="https://cdn.example/x.jpg">
                </head></html>`;
                const og = parseOpenGraph(html);
                expect(og.title).to.equal('Hello & World');
                expect(og.description).to.equal('A description');
                expect(og.imageUrl).to.equal('https://cdn.example/x.jpg');
            });
            it('falls back to <title> when no og:title', function () {
                const og = parseOpenGraph(
                    '<html><head><title>Page &lt;Title&gt;</title></head></html>',
                );
                expect(og.title).to.equal('Page <Title>');
            });
            it('accepts og:image:secure_url', function () {
                const og = parseOpenGraph(
                    '<meta property="og:image:secure_url" content="https://cdn.example/s.jpg">',
                );
                expect(og.imageUrl).to.equal('https://cdn.example/s.jpg');
            });
            it('returns all-undefined for a document with nothing useful', function () {
                const og = parseOpenGraph('<html><body>no metadata</body></html>');
                expect(og.title).to.equal(undefined);
                expect(og.description).to.equal(undefined);
                expect(og.imageUrl).to.equal(undefined);
            });
            it('truncates over-long fields', function () {
                const long = 'x'.repeat(1000);
                const og = parseOpenGraph(`<meta property="og:title" content="${long}">`);
                expect(og.title?.length).to.equal(500);
            });
        });

        describe('decodeEntities', function () {
            it('decodes named entities', function () {
                expect(decodeEntities('a &amp; b &lt; c &gt; d &quot;e&quot;')).to.equal(
                    'a & b < c > d "e"',
                );
            });
            it('decodes numeric + hex entities', function () {
                expect(decodeEntities('&#65;&#x42;')).to.equal('AB');
            });
            it('leaves unknown entities intact', function () {
                expect(decodeEntities('&notreal;')).to.equal('&notreal;');
            });
        });
    });
}
