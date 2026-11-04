import {describe, expect, it} from 'vitest';

import {getRelativeCharmPosition} from './helpers';

describe('helpers.ts', () => {
    describe('getRelativeCharmPosition', () => {
        it('converts a radial position to a relative one', () => {
            // Act
            const position = getRelativeCharmPosition({type: 'radial', degrees: 90});

            // Assert: At 90°, i.e. the right of the outline, the charm is moved by the full radius
            // (`50`) along the x axis and not at all along the y axis.
            expect(position).toEqual({
                offsetPx: {x: 0, y: 0},
                type: 'relative',
                x: 100,
                y: 50,
            });
        });

        it('keeps a relative position as is', () => {
            // Act
            const position = getRelativeCharmPosition({type: 'relative', x: 25, y: 75});

            // Assert
            expect(position).toEqual({
                offsetPx: {x: 0, y: 0},
                type: 'relative',
                x: 25,
                y: 75,
            });
        });

        it('keeps the offset of a radial position', () => {
            // Act
            const position = getRelativeCharmPosition({
                type: 'radial',
                degrees: 90,
                offsetPx: {x: -5, y: 5},
            });

            // Assert
            expect(position.offsetPx).toEqual({x: -5, y: 5});
        });

        it('keeps the offset of a relative position', () => {
            // Act
            const position = getRelativeCharmPosition({
                type: 'relative',
                x: 25,
                y: 75,
                offsetPx: {x: -5, y: 5},
            });

            // Assert
            expect(position.offsetPx).toEqual({x: -5, y: 5});
        });

        it('rejects an unknown type of position', () => {
            // Act
            function convert(): unknown {
                return getRelativeCharmPosition({type: 'diagonal'} as never);
            }

            // Assert
            expect(convert).toThrow('Unreachable');
        });
    });
});
