import {ensureU53, type u53} from '~/common/types';

/** Cancel non-successful response bodies before returning control to the caller. */
export async function readSuccessfulResponseBytes(
    response: Response,
    maxBytes: u53,
): Promise<Uint8Array | undefined> {
    if (!response.ok) {
        await response.body?.cancel('Response status is not successful');
        return undefined;
    }
    return await readResponseBytes(response, maxBytes);
}

/** Read a response body without permitting an endpoint to force unbounded buffering. */
export async function readResponseBytes(response: Response, maxBytes: u53): Promise<Uint8Array> {
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && /^\d+$/u.test(contentLength)) {
        if (BigInt(contentLength) > BigInt(maxBytes)) {
            await response.body?.cancel('Response body exceeds the configured limit');
            throw new Error(`Response body exceeds ${maxBytes} bytes`);
        }
    }

    if (response.body === null) {
        return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes: u53 = 0;
    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) {
                break;
            }
            totalBytes = ensureU53(totalBytes + value.byteLength);
            if (totalBytes > maxBytes) {
                await reader.cancel('Response body exceeds the configured limit');
                throw new Error(`Response body exceeds ${maxBytes} bytes`);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
