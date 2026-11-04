import {afterEach, describe, expect, it, vi} from 'vitest';

import {getGraphemeClusters} from './get-grapheme-clusters.js';

describe('getGraphemeClusters', () => {
    describe('with Intl.Segmenter', () => {
        it('returns the first cluster if no count is given', () => {
            // Arrange
            const text = 'hello';

            // Act
            const result = getGraphemeClusters(text);

            // Assert
            expect(result).toEqual(['h']);
        });

        it('splits regular ASCII strings', () => {
            // Arrange
            const text = 'hello';

            // Act + Assert
            expect(getGraphemeClusters(text, 0)).toEqual([]);
            expect(getGraphemeClusters(text, 1)).toEqual(['h']);
            expect(getGraphemeClusters(text, 2)).toEqual(['h', 'e']);
        });

        it('keeps multi-code-point clusters intact', () => {
            // Arrange
            const text = '👨‍👩‍👧‍👦🦄 emoji family';

            // Act + Assert
            expect(getGraphemeClusters(text, 0)).toEqual([]);
            expect(getGraphemeClusters(text, 1)).toEqual(['👨‍👩‍👧‍👦']);
            expect(getGraphemeClusters(text, 2)).toEqual(['👨‍👩‍👧‍👦', '🦄']);
            expect(getGraphemeClusters('👨‍👩‍👧‍👦a🦄', 3)).toEqual(['👨‍👩‍👧‍👦', 'a', '🦄']);
        });

        it('keeps a letter and its combining accent in the same cluster', () => {
            // Arrange: An "a" followed by U+0301 (combining acute accent).
            const text = 'ábc';

            // Act
            const result = getGraphemeClusters(text, 2);

            // Assert
            expect(result).toEqual(['á', 'b']);
        });

        it('treats whitespace as its own cluster', () => {
            // Act + Assert
            expect(getGraphemeClusters('a b c', 4)).toEqual(['a', ' ', 'b', ' ']);
            expect(getGraphemeClusters('🦄 spaced unicorn', 2)).toEqual(['🦄', ' ']);
        });

        it('returns fewer clusters than requested if the text is exhausted', () => {
            // Act + Assert
            expect(getGraphemeClusters('', 1)).toEqual([]);
            expect(getGraphemeClusters('', 2)).toEqual([]);
            expect(getGraphemeClusters('hi', 3)).toEqual(['h', 'i']);
            expect(getGraphemeClusters('🦄', 2)).toEqual(['🦄']);
        });

        it('returns an empty array if no clusters are requested', () => {
            // Act + Assert
            expect(getGraphemeClusters('', 0)).toEqual([]);
            expect(getGraphemeClusters('hello', 0)).toEqual([]);
        });
    });

    describe('without Intl.Segmenter', () => {
        // Note: `getGraphemeClusters` only ever accesses `Intl.Segmenter`, so replacing `Intl` with
        // an empty object is enough to simulate a runtime that lacks segmentation support.
        function stubIntlWithoutSegmenter(): void {
            vi.stubGlobal('Intl', {});
        }

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('returns the first code unit if no count is given', () => {
            // Arrange
            stubIntlWithoutSegmenter();

            // Act
            const result = getGraphemeClusters('hello');

            // Assert
            expect(result).toEqual(['h']);
        });

        it('splits regular ASCII strings', () => {
            // Arrange
            stubIntlWithoutSegmenter();

            // Act + Assert
            expect(getGraphemeClusters('hello', 0)).toEqual([]);
            expect(getGraphemeClusters('hello', 2)).toEqual(['h', 'e']);
        });

        it('returns fewer clusters than requested if the text is exhausted', () => {
            // Arrange
            stubIntlWithoutSegmenter();

            // Act + Assert
            expect(getGraphemeClusters('', 1)).toEqual([]);
            expect(getGraphemeClusters('hi', 3)).toEqual(['h', 'i']);
        });

        it('splits multi-code-point clusters into single UTF-16 code units', () => {
            // Arrange: A unicorn is a surrogate pair, i.e. two UTF-16 code units.
            stubIntlWithoutSegmenter();
            const text = '🦄a';

            // Act
            const result = getGraphemeClusters(text, 3);

            // Assert
            expect(result).toEqual(['\ud83e', '\udd84', 'a']);
        });
    });
});
