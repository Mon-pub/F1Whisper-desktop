import {describe, expect, it} from 'vitest';

import {nodeIsTarget} from './node-is-target';

describe('nodeIsTarget', () => {
    it('returns false if node is null', () => {
        const target = document.createElement('div');
        expect(nodeIsTarget(null, target)).toBe(false);
    });

    it('returns false if node is undefined', () => {
        const target = document.createElement('div');
        expect(nodeIsTarget(undefined, target)).toBe(false);
    });

    it('returns false if target is null', () => {
        const node = document.createElement('div');
        expect(nodeIsTarget(node, null)).toBe(false);
    });

    it('returns false if target is undefined', () => {
        const node = document.createElement('div');
        expect(nodeIsTarget(node, undefined)).toBe(false);
    });

    it('returns false if node and target are different elements', () => {
        const node = document.createElement('div');
        const target = document.createElement('div');
        expect(nodeIsTarget(node, target)).toBe(false);
    });

    it('returns true if node and target are the same element', () => {
        const node = document.createElement('div');
        expect(nodeIsTarget(node, node)).toBe(true);
    });

    it('returns true with the event.target of an event dispatched on node', () => {
        // Arrange
        const node = document.createElement('div');
        // eslint-disable-next-line @typescript-eslint/no-restricted-types
        let capturedTarget: EventTarget | null = null;
        node.addEventListener('click', (event) => (capturedTarget = event.target), {once: true});

        // Act
        node.dispatchEvent(new MouseEvent('click'));

        // Assert
        expect(nodeIsTarget(node, capturedTarget)).toBe(true);
    });

    it('returns false with the event.target of an event dispatched on a different element', () => {
        // Arrange
        const node = document.createElement('div');
        const other = document.createElement('span');
        // eslint-disable-next-line @typescript-eslint/no-restricted-types
        let capturedTarget: EventTarget | null = null;
        other.addEventListener('click', (event) => (capturedTarget = event.target), {once: true});

        // Act
        other.dispatchEvent(new MouseEvent('click'));

        // Assert
        expect(nodeIsTarget(node, capturedTarget)).toBe(false);
    });
});
