// Dynamically import all `*.spec.ts` files.
// This is done using the glob import feature in vite:
// https://vitejs.dev/guide/features.html#glob-import
const specs = import.meta.glob('./**/*.spec.ts', {eager: true});

// Mocks a import for the `dom` files to be included in the karma bundle so that it may be considered
// when calculating test-coverage. We quickly access is so that it is not "optimized-away".
// `emoji-service.ts` uses a type of dynamic import that is not supported by the instrumenter plugin
// and is therefore excluded.
const modules = import.meta.glob(
    ['./../../common/dom/**/*.ts', '!./../../common/dom/ui/emoji-service.ts'],
    {eager: true},
);
Object.values(modules).forEach(
    // Do nothing
    (m) => {},
);

if (Object.values(specs).length === 0) {
    throw new Error('Import glob did not match any spec files!');
}
