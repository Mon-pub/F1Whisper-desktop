import {expect} from 'chai';

import {assert} from '~/common/utils/assert';
import {UTF8} from '~/common/utils/codec';
import {getGraphemeClusters, getLongestValidMatchingGraphemeSequence} from '~/common/utils/string';

export function run(): void {
    describe('Get longest valid graphemes', function () {
        it('correctly return the full text if no graphemes are split', function () {
            const sequence = 'abcdefghjkl';
            const graphemeClusters = getGraphemeClusters(sequence, sequence.length);
            const utf8Encoded = UTF8.encode(sequence);
            const result = getLongestValidMatchingGraphemeSequence(
                0,
                utf8Encoded.byteLength,
                0,
                0,
                graphemeClusters,
                sequence,
                utf8Encoded,
            );

            expect(result?.text).to.eq(sequence);
            expect(result?.newStartByteIndex).to.eq(sequence.length);
        });

        it('correctly returns undefined if the sequences do not match', function () {
            const sequence = 'abcdefghjkl';
            const graphemeClusters = getGraphemeClusters(sequence, sequence.length);
            const utf8Encoded = UTF8.encode('sequence');
            const result = getLongestValidMatchingGraphemeSequence(
                0,
                utf8Encoded.byteLength,
                0,
                0,
                graphemeClusters,
                sequence,
                utf8Encoded,
            );

            expect(result).to.be.undefined;
        });

        it('correctly removes a split grapheme from the end', function () {
            // An emoji is typically more than one UTF8 byte
            const sequence = 'abcdefgijkabcdefgabcdefgabcdef😵‍💫🌞';
            const graphemeCluters = getGraphemeClusters(sequence, sequence.length);
            const utf8Encoded = UTF8.encode(sequence);
            const result = getLongestValidMatchingGraphemeSequence(
                0,
                30,
                0,
                0,
                graphemeCluters,
                sequence,
                utf8Encoded,
            );

            assert(result !== undefined);
            expect(result.text).to.eq('abcdefgijkabcdefgabcdefgabcdef');
            expect(result.newStartByteIndex).to.eq(30);

            const result2 = getLongestValidMatchingGraphemeSequence(
                result.newStartByteIndex,
                utf8Encoded.byteLength,
                result.text.length,
                result.newGraphemeStartIndex,
                graphemeCluters,
                sequence,
                utf8Encoded,
            );
            expect(result2?.text).to.eq('😵‍💫🌞');
        });
    });

    describe('Split messages into chunks of maximal size', function () {
        it('correctly split a long message of chars longer than one byte without changing its form', function () {
            const emojis = ['😵‍💫', '☁️', '🤥', '☃️', '👩🏽‍🦰', '🧑🏻‍✈️', '🧞‍♂️'];
            const finalText = [];
            for (let i = 0; i < 1000; i++) {
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                finalText.push(emoji);
            }

            const text = finalText.join('');
            // Otherwise we need to slice the message.
            const encodedUtf8Text = UTF8.encode(text);
            const graphemeClusteredText = getGraphemeClusters(text, text.length);
            const finalResult = [];
            let stringIndex = 0;
            let graphemeIndex = 0;
            for (let byteIndex = 0; byteIndex < encodedUtf8Text.byteLength; ) {
                const chunkingResult = getLongestValidMatchingGraphemeSequence(
                    byteIndex,
                    byteIndex + 30,
                    stringIndex,
                    graphemeIndex,
                    graphemeClusteredText,
                    text,
                    encodedUtf8Text,
                );

                assert(chunkingResult !== undefined, 'Chunking result should not be undefined');
                finalResult.push(chunkingResult.text);
                stringIndex += chunkingResult.text.length;
                byteIndex = chunkingResult.newStartByteIndex;
                graphemeIndex = chunkingResult.newGraphemeStartIndex;
            }

            expect(finalResult.join(''), 'Strings should match').to.equal(text);
        });
    });
}
