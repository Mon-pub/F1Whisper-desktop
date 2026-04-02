import {describe, expect, it} from 'vitest';

import {isPromise} from './is-promise.js';

describe('isPromise', () => {
    it('returns true for a native Promise', () => {
        // Arrange
        const value = Promise.resolve();

        // Act
        const result = isPromise(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a thenable where catch and finally are functions', () => {
        // Arrange
        const value = {
            then: (): void => {},
            catch: (): void => {},
            finally: (): void => {},
        };

        // Act
        const result = isPromise(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a thenable without catch', () => {
        // Arrange
        const value = {then: (): void => {}};

        // Act
        const result = isPromise(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a thenable where catch is not a function', () => {
        // Arrange
        const value = {then: (): void => {}, catch: 'not-a-function'};

        // Act
        const result = isPromise(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a thenable without finally', () => {
        // Arrange
        const value = {then: (): void => {}, catch: (): void => {}};

        // Act
        const result = isPromise(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a thenable where finally is not a function', () => {
        // Arrange
        const value = {then: (): void => {}, catch: (): void => {}, finally: 'not-a-function'};

        // Act
        const result = isPromise(value);

        // Assert
        expect(result).toBe(false);
    });
});
