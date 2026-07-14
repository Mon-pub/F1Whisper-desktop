/**
 * The single source of truth for the product User-Agent sent to our own infrastructure.
 *
 * F1Whisper fork: the version token ends in the public desktop release counter (`-f1.<N>`, from
 * `import.meta.env.F1_RELEASE`) so the server can parse the iteration and enforce a per-product
 * minimum-release floor (the hard update gate).
 *
 * This constant is consumed both by {@link STATIC_CONFIG.USER_AGENT} (renderer/DOM + Node OPPF/Safe
 * paths) and by the Electron main-process `onBeforeSendHeaders` interceptor. It must stay a single
 * exported value: `User-Agent` is a Fetch-spec forbidden request header, so Chromium silently strips
 * any value the renderer sets on a DOM `fetch()`. The main-process interceptor re-applies this exact
 * string to every Chromium-stack request, which is why both sites must reference this one constant.
 */
export const USER_AGENT = `F1Whisper-Desktop/${import.meta.env.BUILD_VERSION}-f1.${
    import.meta.env.F1_RELEASE
} (${import.meta.env.BUILD_VARIANT}, ${import.meta.env.BUILD_TARGET})`;
