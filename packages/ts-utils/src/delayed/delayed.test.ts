import {describe, expect, it} from 'vitest';

import {DelayedError} from './delayed-error.js';
import {Delayed} from './delayed.js';

class CustomError extends Error {}

describe('Delayed', () => {
    describe('constructor + unwrap', () => {
        it('throws the supplied get-error when unwrap is called before set', () => {
            // Arrange
            const delayed = new Delayed<number, CustomError>(
                () => new CustomError('not set'),
                () => new CustomError('already set'),
            );

            // Act + Assert
            expect(() => delayed.unwrap()).toThrow(CustomError);
            expect(() => delayed.unwrap()).toThrow('not set');
        });

        it('returns the inner value after set', () => {
            // Arrange
            const delayed = new Delayed<number, CustomError>(
                () => new CustomError('not set'),
                () => new CustomError('already set'),
            );

            // Act
            delayed.set(42);

            // Assert
            expect(delayed.unwrap()).toBe(42);
        });
    });

    describe('isSet', () => {
        it('returns false when the value has not been set', () => {
            const delayed = new Delayed<number>(
                () => new Error('not set'),
                () => new Error('already set'),
            );
            expect(delayed.isSet()).toBe(false);
        });

        it('returns true after a value has been set', () => {
            const delayed = new Delayed<number>(
                () => new Error('not set'),
                () => new Error('already set'),
            );
            delayed.set(7);
            expect(delayed.isSet()).toBe(true);
        });
    });

    describe('set', () => {
        it('throws the supplied set-error when set is called twice', () => {
            // Arrange
            const delayed = new Delayed<number, CustomError>(
                () => new CustomError('not set'),
                () => new CustomError('already set'),
            );
            delayed.set(1);

            // Act + Assert
            expect(() => delayed.set(2)).toThrow(CustomError);
            expect(() => delayed.set(2)).toThrow('already set');
        });
    });

    describe('simple', () => {
        it('produces `DelayedError` instances on get-before-set', () => {
            const delayed = Delayed.simple<number>('counter');
            try {
                delayed.unwrap();
                expect.fail('expected `unwrap` to throw');
            } catch (error) {
                expect(error).toBeInstanceOf(DelayedError);
                expect((error as DelayedError).type).toBe('get');
                expect((error as DelayedError).title).toBe('counter');
            }
        });

        it('produces `DelayedError` instances on double set', () => {
            const delayed = Delayed.simple<number>('counter');
            delayed.set(1);
            try {
                delayed.set(2);
                expect.fail('expected the second `set` to throw');
            } catch (error) {
                expect(error).toBeInstanceOf(DelayedError);
                expect((error as DelayedError).type).toBe('set');
                expect((error as DelayedError).title).toBe('counter');
            }
        });

        it('immediately sets the value when one is provided', () => {
            const delayed = Delayed.simple<number>('counter', 42);
            expect(delayed.isSet()).toBe(true);
            expect(delayed.unwrap()).toBe(42);
        });

        it('does not pre-set when the value is undefined', () => {
            const delayed = Delayed.simple<number>('counter', undefined);
            expect(delayed.isSet()).toBe(false);
        });
    });
});
