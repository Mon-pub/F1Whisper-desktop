import {describe, expect, it} from 'vitest';

import {nodeIsOrContainsTarget} from './node-is-or-contains-target';

describe('nodeIsOrContainsTarget', () => {
    it('returns false if node is null', () => {
        const target = document.createElement('div');
        expect(nodeIsOrContainsTarget(null, target)).toBe(false);
    });

    it('returns false if node is undefined', () => {
        const target = document.createElement('div');
        expect(nodeIsOrContainsTarget(undefined, target)).toBe(false);
    });

    it('returns false if target is null', () => {
        const node = document.createElement('div');
        expect(nodeIsOrContainsTarget(node, null)).toBe(false);
    });

    it('returns false if target is undefined', () => {
        const node = document.createElement('div');
        expect(nodeIsOrContainsTarget(node, undefined)).toBe(false);
    });

    it('returns false if target is not in the subtree of node', () => {
        const node = document.createElement('div');
        const target = document.createElement('span');
        expect(nodeIsOrContainsTarget(node, target)).toBe(false);
    });

    it('returns true if target is a descendant of node', () => {
        const node = document.createElement('div');
        const target = document.createElement('span');
        node.appendChild(target);
        expect(nodeIsOrContainsTarget(node, target)).toBe(true);
    });

    it('returns true if node and target are the same element', () => {
        const node = document.createElement('div');
        expect(nodeIsOrContainsTarget(node, node)).toBe(true);
    });

    it('returns true with the event.target of an event dispatched on a descendant', () => {
        // Arrange
        const node = document.createElement('div');
        const child = document.createElement('span');
        node.appendChild(child);
        // eslint-disable-next-line @typescript-eslint/no-restricted-types
        let capturedTarget: EventTarget | null = null;
        child.addEventListener('click', (event) => (capturedTarget = event.target), {once: true});

        // Act
        child.dispatchEvent(new MouseEvent('click', {bubbles: true}));

        // Assert
        expect(nodeIsOrContainsTarget(node, capturedTarget)).toBe(true);
    });

    it('returns false with the event.target of an event dispatched on an unrelated element', () => {
        // Arrange
        const node = document.createElement('div');
        const other = document.createElement('span');
        // eslint-disable-next-line @typescript-eslint/no-restricted-types
        let capturedTarget: EventTarget | null = null;
        other.addEventListener('click', (event) => (capturedTarget = event.target), {once: true});

        // Act
        other.dispatchEvent(new MouseEvent('click'));

        // Assert
        expect(nodeIsOrContainsTarget(node, capturedTarget)).toBe(false);
    });
});
