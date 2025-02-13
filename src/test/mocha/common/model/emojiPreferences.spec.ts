import {expect} from 'chai';

import {ensureIdentityString} from '~/common/network/types';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';
import {TIMER} from '~/common/utils/timer';
import {makeTestServices, type TestServices} from '~/test/mocha/common/backend-mocks';

export function run(): void {
    describe('emoji preferences model', function () {
        let services: TestServices;

        this.beforeEach(function () {
            services = makeTestServices(ensureIdentityString('MEMEMEME'));
        });

        it('add an emoji skin tone preference', function () {
            const {emojiPreferences} = services.model.user;
            emojiPreferences
                .get()
                .controller.setSkinTonePreference(
                    '👌' as SingleUnicodeEmoji,
                    '👌🏽' as SingleUnicodeEmoji,
                );
            expect(
                emojiPreferences.get().view.skinTonePreferences.get('👌' as SingleUnicodeEmoji),
            ).to.eq('👌🏽');
        });

        it('add emoji favorites and sort by most used', function () {
            const {emojiPreferences} = services.model.user;

            for (let i = 0; i < 10; i++) {
                if (i % 2 === 0) {
                    emojiPreferences.get().controller.updateFavorites('🙂‍↕️' as SingleUnicodeEmoji);
                }
                emojiPreferences.get().controller.updateFavorites('🥲' as SingleUnicodeEmoji);
            }

            const favorites = emojiPreferences.get().view.sortedFavorites;
            expect(favorites.length, 'Favorites should contain two emojis').to.eq(2);
            expect(favorites[0]?.emoji, 'Most used emoji should be first').to.equal('🥲');
            expect(favorites[1]?.emoji, 'Lesser used emoji should be second').to.equal('🙂‍↕️');
            expect(favorites[0]?.nUsed).to.equal(10);
            expect(favorites[1]?.nUsed).to.equal(5);
        });

        it('add emoji favorites and secondarily sort by last added', async function () {
            const {emojiPreferences} = services.model.user;

            for (let i = 0; i < 10; i++) {
                emojiPreferences.get().controller.updateFavorites('🙂‍↕️' as SingleUnicodeEmoji);

                await TIMER.sleep(50);

                emojiPreferences.get().controller.updateFavorites('🥲' as SingleUnicodeEmoji);
            }

            const favorites = emojiPreferences.get().view.sortedFavorites;
            expect(favorites.length, 'Favorites should contain two emojis').to.eq(2);
            expect(favorites[0]?.nUsed).to.equal(10);
            expect(favorites[1]?.nUsed).to.equal(10);
            expect(
                favorites[0]?.emoji,
                'Last used emoji should be first when nUsed match',
            ).to.equal('🥲');
            expect(favorites[1]?.emoji, 'Older emoji should be second').to.equal('🙂‍↕️');
        });
    });
}
