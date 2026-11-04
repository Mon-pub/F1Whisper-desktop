import type {u53} from '../integer/u53.js';

import {SequenceNumberUXX} from './sequence-number-uxx.js';

/**
 * A generic 53-bit unsigned sequence number. Prevents wrapping.
 */
export class SequenceNumberU53<SNV extends u53> extends SequenceNumberUXX<SNV> {
    public constructor(start: SNV) {
        super(start, (2 ** 53 - 1) as SNV);
    }
}
