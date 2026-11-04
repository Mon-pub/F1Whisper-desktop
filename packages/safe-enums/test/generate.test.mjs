// @ts-check

/**
 * Golden-file tests for the safe enum generator.
 *
 * To refresh the expected files after an intended change to the emitted output, run the tests with
 * `--update` (e.g. `pnpm exec vitest run --update`) and review the resulting diff.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, test} from 'vitest';

import {generateSafeEnums} from '../src/generate.mjs';
import {renderSafeEnums} from '../src/render.mjs';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

/**
 * Generate the safe enum variants of the given schema fixture.
 *
 * @param {string} name The name of the fixture (without suffix).
 * @returns {Promise<string>} the formatted source text of the generated module.
 * @throws {SchemaError} if the schema contains a statement that cannot be transformed.
 */
async function renderFixture(name) {
    const schemaPath = path.join(FIXTURES_DIR, `${name}.schema.ts`);
    return await renderSafeEnums(fs.readFileSync(schemaPath, 'utf8'), schemaPath, schemaPath);
}

describe('safe enum generation', () => {
    test('copies the TypeScript directives at the top of a schema', async () => {
        // Act
        const generated = await renderFixture('leading-directives');

        // Assert
        await expect(generated).toMatchFileSnapshot(
            path.join(FIXTURES_DIR, 'leading-directives.generated.ts'),
        );
    });

    test('generates all utilities for a numeric enum', async () => {
        // Act
        const generated = await renderFixture('numeric-enum');

        // Assert
        await expect(generated).toMatchFileSnapshot(
            path.join(FIXTURES_DIR, 'numeric-enum.generated.ts'),
        );
    });

    test('generates conversion and name helpers for a string enum', async () => {
        // Act
        const generated = await renderFixture('string-enum');

        // Assert
        await expect(generated).toMatchFileSnapshot(
            path.join(FIXTURES_DIR, 'string-enum.generated.ts'),
        );
    });

    test('generates conversion helpers for an implicitly numbered enum', async () => {
        // Act
        const generated = await renderFixture('implicit-numbering');

        // Assert
        await expect(generated).toMatchFileSnapshot(
            path.join(FIXTURES_DIR, 'implicit-numbering.generated.ts'),
        );
    });

    test('drops unreferenced imports and keeps aliased bindings', async () => {
        // Act
        const generated = await renderFixture('unused-import');

        // Assert
        await expect(generated).toMatchFileSnapshot(
            path.join(FIXTURES_DIR, 'unused-import.generated.ts'),
        );
    });
});

describe('schema rejection', () => {
    test('rejects a relative import specifier', async () => {
        // Act
        const generated = renderFixture('relative-import');

        // Assert
        await expect(generated).rejects.toThrow(
            "relative-import.schema.ts:2:1: Relative import specifier './../types'",
        );
    });

    test('rejects an import specifier that is not a string literal', async () => {
        // Act
        const generated = renderFixture('non-literal-specifier');

        // Assert
        await expect(generated).rejects.toThrow(
            'non-literal-specifier.schema.ts:2:1: Import specifier must be a string literal',
        );
    });

    test('rejects a default import', async () => {
        // Act
        const generated = renderFixture('default-import');

        // Assert
        await expect(generated).rejects.toThrow(
            'default-import.schema.ts:2:1: Schema imports must be named imports',
        );
    });

    test('rejects a statement that is neither an import nor an enum declaration', async () => {
        // Act
        const generated = renderFixture('unsupported-statement');

        // Assert
        await expect(generated).rejects.toThrow(
            'unsupported-statement.schema.ts:10:1: A schema may only contain import and enum declarations, got TypeAliasDeclaration',
        );
    });

    test('rejects a computed enum member name', async () => {
        // Act
        const generated = renderFixture('computed-member-name');

        // Assert
        await expect(generated).rejects.toThrow(
            'computed-member-name.schema.ts:5:5: Enum member name must be an identifier',
        );
    });

    test('rejects an enum where only some members have an initialiser', async () => {
        // Act
        const generated = renderFixture('partial-initialisers');

        // Assert
        await expect(generated).rejects.toThrow(
            'partial-initialisers.schema.ts:6:5: Either all enum members should have initialisers or none of them',
        );
    });

    test('rejects an enum member initialised with an expression', async () => {
        // Act
        const generated = renderFixture('expression-initialiser');

        // Assert
        await expect(generated).rejects.toThrow(
            'expression-initialiser.schema.ts:5:5: Enum member must have a numeric or string literal as initialiser',
        );
    });

    test('rejects a mix of numeric and string initialisers', async () => {
        // Act
        const generated = renderFixture('mixed-initialisers');

        // Assert
        await expect(generated).rejects.toThrow(
            'mixed-initialisers.schema.ts:4:1: Enum members must all have the same initialiser kind, not a mix of [number,string]',
        );
    });

    test('rejects an enum whose utilities refer to an identifier that is not imported', async () => {
        // Act
        const generated = renderFixture('missing-import');

        // Assert
        await expect(generated).rejects.toThrow(
            "missing-import.schema.ts:7:1: The utilities requested for this enum refer to 'u53', so the schema must import it under exactly that name",
        );
    });

    test('rejects an enum whose utilities refer to an identifier bound under an alias', async () => {
        // Act
        const generated = renderFixture('aliased-import');

        // Assert
        await expect(generated).rejects.toThrow(
            "aliased-import.schema.ts:12:1: The utilities requested for this enum refer to 'Logger', so the schema must import it under exactly that name",
        );
    });

    test('reports the position in a schema of unknown path', () => {
        // Arrange
        const schema = 'export type Foo = number;';

        // Act & Assert
        expect(() => generateSafeEnums(schema)).toThrow('schema.ts:1:1:');
    });
});
