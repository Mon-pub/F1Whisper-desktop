## Playwright: Integration / End-to-End Tests

We use [Playwright](https://playwright.dev/) for e2e testing. All tests should be placed in
`src/test/playwright/tests`. The following flavors are supported:

```bash
pnpm run test:desktop:playwright:consumer-sandbox
pnpm run test:desktop:playwright:work-sandbox
pnpm run test:desktop:playwright:work-onprem
```

### Environment Variables:

|                  Name | Description                                             |             Types |
| --------------------: | ------------------------------------------------------- | ----------------: |
| `PLAYWRIGHT_HEADLESS` | Run tests in headless mode                              | `true` or `false` |
|   `PLAYWRIGHT_FLAVOR` | App variant and environment, e.g. "consumer-sandbox"    |   `BUILD_FLAVORS` |
|  `PLAYWRIGHT_PROFILE` | Will be added to `--threema-profile`, e.g. "playwright" |          `string` |

If you're using
[Playwright Test for VSCode](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright)
you can setup the required env vars in your `settings.json`:

```json
  "playwright.env": {
    "PLAYWRIGHT_HEADLESS": false,
    "PLAYWRIGHT_FLAVOR": "consumer-sandbox",
    "PLAYWRIGHT_PROFILE": "playwright"
  }
```

### Test Data:

Playwright is expecting a test data file at `src/test/playwright/`. The filename should be
`test-data-${PLAYWRIGHT_FLAVOR}.json` and match your `PLAYWRIGHT_FLAVOR` e.g.
`test-data-consumer-sandbox.json`.

Tests can request a specific user by passing `onPremUser` to `launchElectronApp`. This switches the
filename to `test-data-${PLAYWRIGHT_FLAVOR}-${user}.json`, e.g. `test-data-work-onprem-user1.json`.

For local development, you shouldn’t modify these files. Instead, create a local override with the
filename `test-data-${PLAYWRIGHT_FLAVOR}.local.json` (or
`test-data-${PLAYWRIGHT_FLAVOR}-${user}.local.json`).

```json
{
  "profile": {
    "identity": "XXXXXXXX",
    "keyStoragePassword": "CHANGE_ME",
    "privateKey": "private key as hex string"
  },
  "serverGroup": "XX",
  "deviceIds": {
    "d2mDeviceId": 123,
    "cspDeviceId": 456
  },
  "deviceCookie": 16
}
```

A standalone ThreemaId can be created with the following tools from our GitLab instance:

`console-client`:

```bash
./console/threema-console -s \
    data-path/identity1 \
    data-path/contacts \
    data-path/nonces \
    createIdentity
```

Identity, privateKey and serverGroup can be found in `data-path/identity1` after invoking this
command.

`libthreema`:

```bash
cargo run --example identity-create --features=cli -- --consumer sandbox
```

You should find something like this in the output.

```bash
--threema-id <identity>
--client-key <privateKey>
--csp-server-group <serverGroup>
```

### OnPrem Test Data:

OnPrem test data has three extra fields on top of the schema above:

- `workData`: `{username, password}` credentials presented to the OnPrem provisioning server's
  Basic-auth challenge.
- `oppfUrl`: URL the app fetches the OPPF from. For e2e tests this points at the local mock server,
  e.g. `https://127.0.0.1:9443/config.oppf`.
- `oppFile`: The literal OPPF payload (signed JSON, followed by a newline and the base64 signature).

```json
{
  "profile": {"identity": "XXXXXXXX", "keyStoragePassword": "CHANGE_ME", "privateKey": "..."},
  "serverGroup": "XX",
  "deviceIds": {"d2mDeviceId": 123, "cspDeviceId": 456},
  "deviceCookie": "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
  "workData": {"username": "desktop-endtoend-user1", "password": "123456789"},
  "oppfUrl": "https://127.0.0.1:9443/config.oppf",
  "oppFile": "{ \"work\": { \"url\": ... } }\n<base64-signature>"
}
```

OnPrem tests run against `devon.3ma.ch`. Three test identities are provisioned, one per file:

| File                               | DualLock          |
| ---------------------------------- | ----------------- |
| `test-data-work-onprem-user1.json` | disabled          |
| `test-data-work-onprem-user2.json` | enabled           |
| `test-data-work-onprem-user3.json` | enabled + blocked |

DualLock cannot be toggled at runtime, so the user choice fixes that dimension for the test.
`test-data-work-onprem.json` (no user suffix) mirrors user1 and is used when `launchElectronApp` is
called without an `onPremUser` option.

### OnPrem Provisioning Mock Server:

OnPrem e2e tests run against the real `devon.3ma.ch` backend, but the OnPrem provisioning server
(which serves the OPPF) is replaced by a local mock. This allows tests to serve broken OPPFs (wrong
SPKI pin, expired license, untrusted signature, ...) on demand.

The mock lives in `apps/desktop/src/test/playwright/mocks/onprem-provisioning-server/`:

- `server.ts`: HTTPS server, started as a child process by `global-setup.ts` whenever
  `TURBO_BUILD_ENVIRONMENT === 'onprem'`. Listens on `https://127.0.0.1:9443` with a self-signed
  certificate that is regenerated on each startup, and is killed via SIGTERM on teardown.
- `client.ts`: Exports `mockOppfServer`, used by tests to reconfigure the server.
- `oppf-data.ts` / `signing.ts`: Build and sign OPPF payloads on demand. The trusted signing keypair
  is baked into the test build by `apps/desktop/tools/build-electron.mjs`. A second ephemeral
  keypair is generated at startup to produce the `wrong-signature` variant.
- `types.ts`: Shared types and constants (port, paths, OPPF variants).

Endpoints:

| Path                    | Method     | Auth         | Behaviour                                                                                         |
| ----------------------- | ---------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `/config.oppf`          | GET / HEAD | Basic        | Regular OPPF. Returns the configured variant, or 401 on bad credentials.                          |
| `/config.fallback.oppf` | GET / HEAD | none allowed | Fallback OPPF. 404 when disabled, payload when enabled, 400 if an `Authorization` header is sent. |
| `/__control/oppf`       | PUT        | none         | Override regular OPPF (`variant`, `statusCode`, `username`, `password`).                          |
| `/__control/fallback`   | PUT        | none         | Override fallback (`enabled`, `variant`, `statusCode`).                                           |
| `/__control/reset`      | POST       | none         | Reset state to defaults.                                                                          |
| `/__control/health`     | GET        | none         | Readiness probe.                                                                                  |

Supported OPPF `variant` values: `correct`, `empty-domains-rules`, `expired-license`,
`invalid-base64-pin`, `no-domains`, `too-long-pin`, `wrong-pin`, `wrong-signature`. See `types.ts`
for the authoritative list.

Example usage from a test:

```ts
import {mockOppfServer} from '~/test/playwright/mocks/onprem-provisioning-server/client';

test.beforeEach(async () => {
  await mockOppfServer.reset();
});

test('falls back when SPKI pins are rotated to invalid values', async () => {
  await mockOppfServer.setOppfVariant('wrong-pin');
  await mockOppfServer.enableFallback('correct');
  // ... drive the app, assert recovery via fallback
});
```

`launchElectronApp` automatically calls `setRegularOppf` with the `workData` credentials from the
selected test-data file and the `oppfVariant` option (if any) before starting Electron.

> ⚠️ _Note: The mock server holds a single in-memory state and the Playwright config runs with
> `workers: 1`. Tests must call `reset()` in `beforeEach` to avoid leaking state between scenarios._
