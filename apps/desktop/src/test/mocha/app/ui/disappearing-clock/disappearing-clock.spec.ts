import {expect} from 'chai';

import {
    disappearingClockWedgePath,
    remainingClockFraction,
} from '~/app/ui/components/atoms/disappearing-clock/disappearing-clock';

/**
 * Tests for the pure geometry of the F1Whisper animated disappearing-message countdown clock: the
 * remaining-fraction math (clamped, Signal/Android parity) and the SVG pie-wedge path it drives
 * (empty when elapsed, full disc when fresh, correct sweep + large-arc flag in between).
 */
export function run(): void {
    describe('disappearing-clock geometry', function () {
        describe('remainingClockFraction', function () {
            it('is 1 when the full timer still remains', function () {
                // Now=0, expires at 30s, 30s timer.
                expect(remainingClockFraction(0, 30_000, 30_000)).to.equal(1);
            });

            it('clamps to 1 when more than the timer remains (clock not yet started)', function () {
                expect(remainingClockFraction(0, 60_000, 30_000)).to.equal(1);
            });

            it('is 0 once the message has expired', function () {
                expect(remainingClockFraction(31_000, 30_000, 30_000)).to.equal(0);
            });

            it('is 0 at exactly the expiry instant', function () {
                expect(remainingClockFraction(30_000, 30_000, 30_000)).to.equal(0);
            });

            it('is 0 for a non-positive timer window', function () {
                expect(remainingClockFraction(0, 0, 0)).to.equal(0);
            });

            it('is the linear remaining fraction mid-way through', function () {
                // 15s left of a 30s timer -> half remaining.
                expect(remainingClockFraction(15_000, 30_000, 30_000)).to.equal(0.5);
                // 7.5s left of a 30s timer -> quarter remaining.
                expect(remainingClockFraction(22_500, 30_000, 30_000)).to.equal(0.25);
            });
        });

        describe('disappearingClockWedgePath', function () {
            it('draws nothing when nothing remains', function () {
                expect(disappearingClockWedgePath(0)).to.equal('');
                expect(disappearingClockWedgePath(-0.5)).to.equal('');
            });

            it('draws a closed full disc when (essentially) full', function () {
                const full = 'M 12 5 A 7 7 0 1 1 11.999 5 Z';
                expect(disappearingClockWedgePath(1)).to.equal(full);
                expect(disappearingClockWedgePath(0.9995)).to.equal(full);
            });

            it('draws a quarter wedge to 3 o\'clock with the small-arc flag', function () {
                // 0.25 -> 90deg clockwise from the top -> end at (19, 12), large-arc 0.
                expect(disappearingClockWedgePath(0.25)).to.equal('M 12 12 L 12 5 A 7 7 0 0 1 19 12 Z');
            });

            it('draws a half wedge to 6 o\'clock (large-arc flag still off at exactly 180deg)', function () {
                // 0.5 -> 180deg -> end at (12, 19). sweep is not strictly > PI, so large-arc 0.
                expect(disappearingClockWedgePath(0.5)).to.equal('M 12 12 L 12 5 A 7 7 0 0 1 12 19 Z');
            });

            it('sets the large-arc flag once past the half-way point', function () {
                // 0.75 -> 270deg clockwise -> end at (5, 12), large-arc 1.
                expect(disappearingClockWedgePath(0.75)).to.equal('M 12 12 L 12 5 A 7 7 0 1 1 5 12 Z');
            });
        });
    });
}
