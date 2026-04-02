import {describe, expect, it} from 'vitest';

import {isObject} from './is-object.js';

describe('isObject', () => {
    it('returns true for a plain object', () => {
        // Arrange
        const value = {};

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for an array', () => {
        // Arrange
        const value: number[] = [];

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a class instance', () => {
        // Arrange
        class Foo {
            public foo(): void {}
        }
        const foo = new Foo();

        // Act
        const result = isObject(foo);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a Date instance', () => {
        // Arrange
        const value = new Date();

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a function', () => {
        // Arrange
        function fn(): void {}

        // Act
        const result = isObject(fn);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for null', () => {
        // Arrange
        const value = null;

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for undefined', () => {
        // Arrange
        const value = undefined;

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a number', () => {
        // Arrange
        const value = 42;

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a string', () => {
        // Arrange
        const value = 'string';

        // Act
        const result = isObject(value);

        // Assert
        expect(result).toBe(false);
    });
});
