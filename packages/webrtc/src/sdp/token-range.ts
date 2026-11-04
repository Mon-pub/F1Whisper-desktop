// From grammar for SDP 'token':
// https://www.rfc-editor.org/rfc/rfc4566#section-9
// prettier-ignore
export const SDP_TOKEN_RANGE = [
    '!', '#', '$', '%', '&', "'", '*', '+', '-', '.',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z', '^', '_', '`', 'a',
    'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k',
    'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
    'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~'
] as const;
