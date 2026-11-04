import type {u32} from '../integer/u32.js';

import {SequenceNumberUXX} from './sequence-number-uxx.js';

/**
 * A generic 32-bit unsigned sequence number. Prevents wrapping.
 */
export class SequenceNumberU32<SNV extends u32> extends SequenceNumberUXX<SNV> {
    public constructor(start: SNV) {
        super(start, (2 ** 32 - 1) as SNV);
    }
}
