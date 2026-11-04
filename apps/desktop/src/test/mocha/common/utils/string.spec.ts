import {expect} from 'chai';

import {applyVariables, localeSort, splitAtLeast, truncate} from '~/common/utils/string';

export function run(): void {
    describe('utils::string', function () {
        describe('localeSort', function () {
            it('should sort in case insensitive and locale-aware order', function () {
                expect(
                    ['zzz', 'ZZZ', 'Qqq', 'qqq', 'aaa', 'acc', 'Abb', 'Àha', 'àha'].sort(
                        localeSort,
                    ),
                ).to.eql(['aaa', 'Abb', 'acc', 'àha', 'Àha', 'qqq', 'Qqq', 'zzz', 'ZZZ']);
            });
        });

        describe('truncate', function () {
            it('does not truncate strings shorter than or equal to the specified length', function () {
                expect(truncate('hi🤷‍♀️', 4, 'end')).to.equal('hi🤷‍♀️');
                expect(truncate('hi🤷‍♀️', 3, 'end')).to.equal('hi🤷‍♀️');
            });

            it('truncates correctly at grapheme cluster boundaries, not bytes', function () {
                expect(truncate('hi 🤷‍♀️ there', 6, 'end')).to.equal('hi 🤷‍♀️ …');
                expect(truncate('hi 🤷‍♀️ there', 5, 'end')).to.equal('hi 🤷‍♀️…');
                expect(truncate('hi 🤷‍♀️ there', 4, 'end')).to.equal('hi …');
                expect(truncate('hi 🤷‍♀️ there', 3, 'end')).to.equal('hi…');
            });
        });

        describe('splitAtLeast', function () {
            it('splits 2/2 parts', function () {
                expect(splitAtLeast('hello,world', ',', 2)).to.deep.equal({
                    items: ['hello', 'world'],
                    rest: [],
                });
            });

            it('splits 2/4 parts', function () {
                expect(splitAtLeast('hello:world:and:space', ':', 2)).to.deep.equal({
                    items: ['hello', 'world'],
                    rest: ['and', 'space'],
                });
            });

            it('splits 1/1 parts', function () {
                expect(splitAtLeast('hello', ',', 1)).to.deep.equal({
                    items: ['hello'],
                    rest: [],
                });
            });

            it('handle nItems=0', function () {
                expect(splitAtLeast('hello,big,world', ',', 0)).to.deep.equal({
                    items: [],
                    rest: ['hello', 'big', 'world'],
                });
            });

            it('handle empty items', function () {
                expect(splitAtLeast('hello,,world', ',', 2)).to.deep.equal({
                    items: ['hello', ''],
                    rest: ['world'],
                });
            });

            it('throw if not enough items are found', function () {
                expect(() => splitAtLeast('hello,big,world', ',', 4)).to.throw(
                    'Expected 4 after split, got 3',
                );
            });
        });

        describe('applyVariables', function () {
            it('replace variables that are present', function () {
                expect(applyVariables('hey {b} and {a}', {a: 'Alice', b: 'Bob'})).to.equal(
                    'hey Bob and Alice',
                );
            });

            it('replace nothing when a variable is not present', function () {
                expect(applyVariables('hello, {world}', {mars: 'Mars'})).to.equal('hello, {world}');
            });

            it('replace nothing when no variable is marked', function () {
                expect(applyVariables('hello world', {world: 'Mars'})).to.equal('hello world');
            });
        });
    });
}
