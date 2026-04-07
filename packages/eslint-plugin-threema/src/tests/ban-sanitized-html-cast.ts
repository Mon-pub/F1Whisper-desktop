import test from 'node:test';
import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from '../ban-sanitized-html-cast.js';

RuleTester.afterAll = test.after;
RuleTester.describe = test.describe;
RuleTester.it = test.it;

const ruleTester = new RuleTester();

ruleTester.run('ban-sanitized-html-cast', rule, {
    valid: ['const x = "This is not HTML";'],
    invalid: [
        {
            code: 'const x = "<b>Untrusted HTML</b>" as SanitizedHtml;',
            errors: [
                {
                    messageId: 'sanitizedHtmlCast',
                },
            ],
        },
        {
            code: 'const x = "<b>Untrusted HTML</b>" as SanitizedHtml | undefined;',
            errors: [
                {
                    messageId: 'sanitizedHtmlCast',
                },
            ],
        },
        {
            code: 'const x = "<h1>Untrusted HTML</h1>" as SanitizedHtml & string;',
            errors: [
                {
                    messageId: 'sanitizedHtmlCast',
                },
            ],
        },
        {
            code: 'const x = ["<b>Untrusted HTML</b>", "<h1>Header<h1>"] as SanitizedHtml[];',
            errors: [
                {
                    messageId: 'sanitizedHtmlCast',
                },
            ],
        },
    ],
});
