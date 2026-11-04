/**
 * Remove line and block comments from TypeScript/Svelte source, leaving string and template
 * literals intact, so structural pins cannot be satisfied (or tripped) by prose in a comment.
 */
export function stripComments(source: string): string {
    let out = '';
    let i = 0;
    while (i < source.length) {
        const char = source[i] ?? '';
        const next = source[i + 1];
        if (char === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') {
                i += 1;
            }
        } else if (char === '/' && next === '*') {
            const endIndex = source.indexOf('*/', i + 2);
            i = endIndex === -1 ? source.length : endIndex + 2;
        } else if (char === "'" || char === '"' || char === '`') {
            const quote = char;
            out += char;
            i += 1;
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\') {
                    out += source[i] ?? '';
                    i += 1;
                }
                out += source[i] ?? '';
                i += 1;
            }
            out += quote;
            i += 1;
        } else {
            out += char;
            i += 1;
        }
    }
    return out;
}
