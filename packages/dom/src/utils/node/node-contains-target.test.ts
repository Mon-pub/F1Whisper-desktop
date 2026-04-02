import {describe, expect, it} from 'vitest';

import {nodeContainsTarget} from './node-contains-target';

describe('nodeContainsTarget', () => {
    it('returns false if node is null', () => {
        const target = document.createElement('div');
        expect(nodeContainsTarget(null, target)).toBe(false);
    });

    it('returns false if node is undefined', () => {
        const target = document.createElement('div');
        expect(nodeContainsTarget(undefined, target)).toBe(false);
    });

    it('returns false if target is null', () => {
        const node = document.createElement('div');
        expect(nodeContainsTarget(node, null)).toBe(false);
    });

    it('returns false if target is undefined', () => {
        const node = document.createElement('div');
        expect(nodeContainsTarget(node, undefined)).toBe(false);
    });

    it('returns false if target is not in the subtree of node', () => {
        const node = document.createElement('div');
        const target = document.createElement('span');
        expect(nodeContainsTarget(node, target)).toBe(false);
    });

    it('returns true if target is a descendant of node', () => {
        const node = document.createElement('div');
        const target = document.createElement('span');
        node.appendChild(target);
        expect(nodeContainsTarget(node, target)).toBe(true);
    });

    it('returns true if node and target are the same element', () => {
        const node = document.createElement('div');
        expect(nodeContainsTarget(node, node)).toBe(true);
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
        expect(nodeContainsTarget(node, capturedTarget)).toBe(true);
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
        expect(nodeContainsTarget(node, capturedTarget)).toBe(false);
    });
});
