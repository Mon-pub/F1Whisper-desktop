import banDirectElectronAccess from './ban-direct-electron-access.js';
import banStatefulRegexFlags from './ban-stateful-regex-flags.js';
import banTypedArrayEqualityComparison from './ban-typed-array-equality-comparison.js';
import banTypedArrayLength from './ban-typed-array-length.js';
import compareWorkAndCustom from './compare-work-and-custom.js';
import noTodoCommentsWithoutIssue from './no-todo-comments-without-issue.js';

const plugin = {
    meta: {
        name: '@threema/eslint-plugin-threema',
        version: '0.0.0',
    },
    rules: {
        'ban-direct-electron-access': banDirectElectronAccess,
        'ban-stateful-regex-flags': banStatefulRegexFlags,
        'ban-typed-array-equality-comparison': banTypedArrayEqualityComparison,
        'ban-typed-array-length': banTypedArrayLength,
        'compare-work-and-custom': compareWorkAndCustom,
        'no-todo-comments-without-issue': noTodoCommentsWithoutIssue,
    },
};

export default plugin;
