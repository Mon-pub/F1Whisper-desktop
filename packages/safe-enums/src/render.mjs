// @ts-check

/**
 * Generate the safe enum variants of a schema and format the result.
 */

import {format as formatWithPrettier, resolveConfig} from 'prettier';

import {generateSafeEnums} from './generate.mjs';

/**
 * Generate the safe enum variants of a schema and format the result.
 *
 * Note: The schema path is only used to report the location of a rejected statement, so it may be
 * unresolved, while the format path determines the Prettier configuration that applies and
 * therefore must be the path the result is written to.
 *
 * @param {string} schema The source text of the schema.
 * @param {string} schemaPath The path of the schema, used in error messages.
 * @param {string} formatPath The path whose Prettier configuration applies to the result.
 * @returns {Promise<string>} the formatted source text of the generated module.
 * @throws {SchemaError} if the schema contains a statement that cannot be transformed.
 */
export async function renderSafeEnums(schema, schemaPath, formatPath) {
    const generated = generateSafeEnums(schema, schemaPath);
    const config = await resolveConfig(formatPath);
    return await formatWithPrettier(generated, {...config, filepath: formatPath});
}
