import {describe, expect, it} from 'vitest';

import {SDP_TOKEN_RANGE} from './token-range.js';

describe('SDP_TOKEN_RANGE', () => {
    it('contains 79 distinct single-character tokens', () => {
        // Assert
        expect(SDP_TOKEN_RANGE.length).toBe(79);
        expect(new Set(SDP_TOKEN_RANGE).size).toBe(79);
    });

    it('contains only single-character strings', () => {
        // Assert
        for (const token of SDP_TOKEN_RANGE) {
            expect(token.length).toBe(1);
        }
    });
});
