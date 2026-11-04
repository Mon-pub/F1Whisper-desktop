// @ts-check
import ts from 'typescript';

/**
 * Return leading comments of a node.
 *
 * @param {ts.Node} node The node with leading comments to be retrieved.
 * @param {ts.SourceFile} source The source file to extract the comments from.
 * @returns {ts.SynthesizedComment[]} all leading comments.
 */
export function getLeadingComments(node, source) {
    const text = source.text;
    return (ts.getLeadingCommentRanges(text, node.pos) ?? []).map((range) => ({
        ...range,
        text: text.slice(
            range.pos + 2,
            range.kind === ts.SyntaxKind.MultiLineCommentTrivia ? range.end - 2 : range.end,
        ),
        pos: -1,
        end: -1,
    }));
}

/**
 * Parse source string as virtual TypeScript source file.
 *
 * @param {string} name The virtual file name.
 * @param {string} source The source code text.
 * @returns {ts.SourceFile} the parsed source file.
 */
export function createSource(name, source) {
    return ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
}
