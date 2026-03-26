import {AST_NODE_TYPES, TSESTree, ESLintUtils} from '@typescript-eslint/utils';
import type {ESLintPluginThreemaDocs} from './utils.js';

const createRule = ESLintUtils.RuleCreator<ESLintPluginThreemaDocs>(
    () => 'ban-sanitized-html-cast',
);

export default createRule({
    name: 'ban-sanitized-html-cast',
    meta: {
        type: 'problem',
        docs: {
            description:
                'Do not cast to SanitizedHtml directly. Use sanitizeAndParseTextToHtml() or escapeHtmlUnsafeChars() to ensure the HTML is properly sanitized.',
            recommended: 'strict',
        },
        schema: [],
        messages: {
            sanitizedHtmlCast:
                'Casting to SanitizedHtml bypasses sanitization and can open up opportunities for HTML injection (XSS is covered by SRI). Use sanitizeAndParseTextToHtml() or escapeHtmlUnsafeChars() from ~/app/ui/utils/text instead.',
        },
        fixable: undefined,
    },
    defaultOptions: [],
    create(context) {
        function containsSanitizedHtml(node: TSESTree.TypeNode): boolean {
            if (
                node.type === AST_NODE_TYPES.TSTypeReference &&
                node.typeName.type === AST_NODE_TYPES.Identifier &&
                node.typeName.name === 'SanitizedHtml'
            ) {
                return true;
            }
            if (node.type === AST_NODE_TYPES.TSArrayType) {
                return containsSanitizedHtml(node.elementType);
            }
            if (
                node.type === AST_NODE_TYPES.TSUnionType ||
                node.type === AST_NODE_TYPES.TSIntersectionType
            ) {
                return node.types.some(containsSanitizedHtml);
            }
            return false;
        }

        return {
            TSAsExpression(esNode: TSESTree.TSAsExpression) {
                if (containsSanitizedHtml(esNode.typeAnnotation)) {
                    context.report({
                        node: esNode,
                        messageId: 'sanitizedHtmlCast' as const,
                    });
                }
            },
        };
    },
});
