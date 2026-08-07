import {expect} from 'chai';

import {Queue} from '~/common/utils/queue';

export function run(): void {
    describe('Queue', function () {
        it('revalidates a conditional put after backpressure clears', async function () {
            const queue = new Queue<string>();
            await queue.put('first');

            let eligible = true;
            const second = queue.putConditional('second', () => eligible);
            eligible = false;

            const first = await queue.get();
            expect(first.consume()).to.equal('first');
            expect(await second).to.be.false;
            expect(queue.empty).to.be.true;
        });
    });
}
