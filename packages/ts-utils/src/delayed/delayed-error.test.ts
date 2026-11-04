import {describe, expect, it} from 'vitest';

import {DelayedError} from './delayed-error.js';

describe('DelayedError', () => {
    it('is an `Error` instance with `name` set to `DelayedError`', () => {
        // Arrange + Act
        const error = new DelayedError('get', 'foo');

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('DelayedError');
    });

    it('formats the message for the `get` variant', () => {
        expect(new DelayedError('get', 'foo').message).toBe("Delayed 'foo' not yet set");
    });

    it('formats the message for the `set` variant', () => {
        expect(new DelayedError('set', 'foo').message).toBe("Delayed 'foo' already set");
    });

    it('exposes `type` and `title` as public readonly properties', () => {
        // Arrange + Act
        const error = new DelayedError('get', 'foo');

        // Assert
        expect(error.type).toBe('get');
        expect(error.title).toBe('foo');
    });

    it('throws via `unreachable` when constructed with an unknown variant', () => {
        // Force an unsupported variant through the type system to hit the `default` branch.
        expect(() => new DelayedError('bogus' as 'get', 'foo')).toThrow();
    });

    it('forwards `ErrorOptions.cause` through `super`', () => {
        // Arrange
        const cause = new Error('original');

        // Act
        const error = new DelayedError('get', 'foo', {cause});

        // Assert
        expect(error.cause).toBe(cause);
    });
});
