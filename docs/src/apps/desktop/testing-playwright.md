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

The output will contain the necessary values to substitute in the custom test data file:

```bash
--threema-id <identity>
--client-key <privateKey>
--csp-server-group <serverGroup>
```

### OnPrem Test Data:

OnPrem test data has one extra field on top of the schema above:

- `workData`: `{username, password}` credentials presented to the OnPrem provisioning server's
  Basic-auth challenge.

```json
{
  "profile": {"identity": "XXXXXXXX", "keyStoragePassword": "CHANGE_ME", "privateKey": "..."},
  "serverGroup": "XX",
  "deviceIds": {"d2mDeviceId": 123, "cspDeviceId": 456},
  "deviceCookie": "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
  "workData": {"username": "desktop-endtoend-user1", "password": "123456789"}
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

The OnPrem provisioning server (which serves the OPPF) is replaced by a local mock so tests can
serve broken OPPFs (wrong SPKI pin, expired license, untrusted signature, ...) on demand. Tests
script it via the `mockOppfServer` client in
`src/test/playwright/mocks/onprem-provisioning-server/`; see `onprem-provisioning.spec.ts` for
examples.

> ⚠️ _Note: The mock server holds a single in-memory state and the Playwright config runs with
> `workers: 1`. Tests must call `mockOppfServer.reset()` in `beforeEach` to avoid leaking state
> between scenarios._
