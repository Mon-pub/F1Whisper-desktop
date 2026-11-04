import {describe, expect, expectTypeOf, it} from 'vitest';

import {tag, type Bare, type OpaquePick, type TagOf, type WeakOpaque} from './newtype.js';

// Some sample new-types used throughout the tests. The tag types are named so that the type-level
// assertions can refer to the exact (nominal) tag instead of an unrelated `unique symbol`.
interface UserIdTag {
    readonly UserId: unique symbol;
}
type UserId = WeakOpaque<number, UserIdTag>;
interface TokenTag {
    readonly Token: unique symbol;
}
type Token = WeakOpaque<string, TokenTag>;
interface RawUser {
    readonly id: number;
    readonly name: string;
}
interface UserTag {
    readonly User: unique symbol;
}
type User = WeakOpaque<RawUser, UserTag>;

describe('newtype', () => {
    describe('tag', () => {
        it('returns the same value instance it is given', () => {
            // Arrange
            const value = 42;

            // Act
            const tagged: UserId = tag<UserId>(value);

            // Assert
            expect(tagged).toBe(value);
        });

        it('does not modify object identity when tagging', () => {
            // Arrange
            const value: RawUser = {id: 1, name: 'Alice'};

            // Act
            const tagged: User = tag<User>(value);

            // Assert
            expect(tagged).toBe(value);
            expect(tagged).toEqual({id: 1, name: 'Alice'});
        });

        it('is a pure identity function at runtime (no `__TAG__` property is added)', () => {
            // Arrange
            const value: RawUser = {id: 2, name: 'Bob'};

            // Act
            const tagged: User = tag<User>(value);

            // Assert
            expect(Object.keys(tagged)).toStrictEqual(['id', 'name']);
            expect(Object.hasOwn(tagged, '__TAG__')).toBe(false);
        });

        it('produces a value that is assignable back to the underlying type (`WeakOpaque`)', () => {
            // Act
            const userId: UserId = tag<UserId>(7);

            // Assert: a weak opaque value can be used wherever the bare type is expected.
            const asNumber: number = userId;
            expect(asNumber).toBe(7);
            expectTypeOf(userId).toExtend<number>();
        });
    });

    describe('TagOf', () => {
        it('extracts the tag type from a new-type', () => {
            expectTypeOf<TagOf<UserId>>().toEqualTypeOf<UserIdTag>();
            expectTypeOf<TagOf<Token>>().toEqualTypeOf<TokenTag>();
            expectTypeOf<TagOf<User>>().toEqualTypeOf<UserTag>();
        });

        it('resolves to `never` for non-opaque types', () => {
            expectTypeOf<TagOf<number>>().toEqualTypeOf<never>();
            expectTypeOf<TagOf<string>>().toEqualTypeOf<never>();
        });
    });

    describe('Bare', () => {
        it('removes the new-type from an object new-type', () => {
            expectTypeOf<Bare<User>>().toEqualTypeOf<RawUser>();
        });

        it('leaves non-opaque types unchanged', () => {
            expectTypeOf<Bare<number>>().toEqualTypeOf<number>();
            expectTypeOf<Bare<string>>().toEqualTypeOf<string>();
            expectTypeOf<Bare<RawUser>>().toEqualTypeOf<RawUser>();
        });
    });

    describe('OpaquePick', () => {
        it('picks the requested keys while preserving the opaque tag', () => {
            type PickedUser = OpaquePick<User, 'id'>;

            // The picked key is present...
            expectTypeOf<PickedUser>().toExtend<{readonly id: number}>();
            // ...and the value still carries its opaque tag, so it remains a new-type.
            expectTypeOf<TagOf<PickedUser>>().toEqualTypeOf<UserTag>();
        });
    });
});
