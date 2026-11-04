import {createHash} from 'node:crypto';

import {expect} from 'chai';

/**
 * F1Whisper fork: offline guard for the migration ledger (`src/migrations/LEDGER.json`).
 *
 * The runtime only loads `*.sql`, so nothing else stops a later upstream merge from silently
 * editing an adopted migration, an upstream-native file from colliding with a fork number, or a
 * released migration from being touched. The ledger is the reference; this spec compares the tree
 * against it. It never opens a database.
 *
 * The files are bundled at build time (like `migrations.ts` does), so no runtime path is needed.
 */

const MIGRATION_FILES = import.meta.glob<string>('/migrations/*.sql', {
    eager: true,
    query: '?raw',
    import: 'default',
});
const LEDGER_FILES = import.meta.glob<string>('/migrations/LEDGER.json', {
    eager: true,
    query: '?raw',
    import: 'default',
});

/**
 * `frozenIn` values of releases that real profiles already ran. Their rows may never change. Add a
 * release here (and refresh `RELEASED_ROWS_DIGEST`) when it ships.
 */
const RELEASED_FROZEN_IN: readonly string[] = [
    'v2.0-beta61-f1.1',
    'v2.0-beta61-f1.3',
    'v2.0-beta66-f1.4',
];
const RELEASED_MAX_NUMBER = 61;

/**
 * Tripwire over the released rows (`number:name:upSha256:downSha256`, one per line). Editing a
 * released migration AND its ledger row together still fails here.
 */
const RELEASED_ROWS_DIGEST = '1cd1339c563663f4761b2c1d3228e192756952584fcc4df4b105ba580a2049de';

interface LedgerRow {
    readonly number: number;
    readonly name: string;
    readonly upSha256: string;
    readonly downSha256: string;
    readonly origin: string;
    // The ledger is JSON, where a fork row's missing upstream blob is `null`.
    // eslint-disable-next-line @typescript-eslint/no-restricted-types
    readonly upstreamBlob: {readonly up: string; readonly down: string} | null;
    readonly frozenIn: string;
}

interface Ledger {
    readonly migrations: readonly LedgerRow[];
    readonly historicalVariants: readonly {readonly number: number; readonly name: string}[];
}

interface MigrationFile {
    readonly number: number;
    readonly name: string;
    readonly direction: 'up' | 'down';
    readonly sha256: string;
}

interface UpstreamOrigin {
    readonly tag: string;
    readonly tagOrder: number;
    readonly nativeNumber: number;
    readonly nativeName: string;
}

const FILE_NAME_PATTERN = /(?<number>\d+)-(?<name>.*)\.(?<direction>up|down)\.sql$/u;
const UPSTREAM_ORIGIN_PATTERN =
    /^upstream(?:-adapted)?:(?<tag>v2\.0-beta(?<beta>\d+)):(?<nativeNumber>\d+):(?<nativeName>.+)$/u;

function sha256Hex(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadLedger(): Ledger {
    const raw = Object.values(LEDGER_FILES)[0];
    if (raw === undefined) {
        throw new Error('migrations/LEDGER.json was not found');
    }
    return JSON.parse(raw) as Ledger;
}

function loadMigrationFiles(): readonly MigrationFile[] {
    return Object.entries(MIGRATION_FILES).map(([filePath, contents]) => {
        const groups = FILE_NAME_PATTERN.exec(filePath)?.groups;
        if (groups === undefined) {
            throw new Error(`Migration file name does not match the expected pattern: ${filePath}`);
        }
        return {
            number: Number(groups.number),
            name: requireGroup(groups, 'name'),
            direction: groups.direction as 'up' | 'down',
            sha256: sha256Hex(contents),
        };
    });
}

function requireGroup(groups: Readonly<Record<string, string | undefined>>, name: string): string {
    const value = groups[name];
    if (value === undefined) {
        throw new Error(`Pattern group '${name}' did not match`);
    }
    return value;
}

function parseUpstreamOrigin(origin: string): UpstreamOrigin | undefined {
    const groups = UPSTREAM_ORIGIN_PATTERN.exec(origin)?.groups;
    if (groups === undefined) {
        return undefined;
    }
    return {
        tag: requireGroup(groups, 'tag'),
        tagOrder: Number(groups.beta),
        nativeNumber: Number(groups.nativeNumber),
        nativeName: requireGroup(groups, 'nativeName'),
    };
}

function fileLabel(file: {
    readonly number: number;
    readonly name: string;
    readonly direction: string;
}): string {
    return `${String(file.number).padStart(4, '0')}-${file.name}.${file.direction}.sql`;
}

export function run(): void {
    describe('Migration ledger (F1Whisper fork)', function () {
        const ledger = loadLedger();
        const files = loadMigrationFiles();
        const rows = [...ledger.migrations].sort((a, b) => a.number - b.number);

        it('has a contiguous number sequence 1..max with exactly one up and one down file each', () => {
            const byNumber = new Map<number, MigrationFile[]>();
            for (const file of files) {
                byNumber.set(file.number, [...(byNumber.get(file.number) ?? []), file]);
            }
            const maxNumber = Math.max(...byNumber.keys());
            for (let number = 1; number <= maxNumber; ++number) {
                const forNumber = byNumber.get(number) ?? [];
                expect(
                    forNumber.map((file) => file.direction).sort(),
                    `files for migration ${number}: ${forNumber.map(fileLabel).join(', ')}`,
                ).to.deep.equal(['down', 'up']);
                expect(
                    new Set(forNumber.map((file) => file.name)).size,
                    `up and down of migration ${number} must share one name`,
                ).to.equal(1);
            }
            expect([...byNumber.keys()].sort((a, b) => a - b)).to.deep.equal(
                Array.from({length: maxNumber}, (_, index) => index + 1),
            );
        });

        it('has no duplicate migration number across file names', () => {
            const seen = new Set<string>();
            for (const file of files) {
                const key = `${file.number}:${file.direction}`;
                expect(seen.has(key), `duplicate ${fileLabel(file)}`).to.be.false;
                seen.add(key);
            }
        });

        it('has a ledger row for every migration number and a migration for every row', () => {
            const fileNumbers = [...new Set(files.map((file) => file.number))].sort(
                (a, b) => a - b,
            );
            const rowNumbers = rows.map((row) => row.number);
            expect(new Set(rowNumbers).size, 'duplicate ledger row numbers').to.equal(
                rowNumbers.length,
            );
            expect(rowNumbers).to.deep.equal(fileNumbers);
        });

        it('matches the name and the sha256 of every up and down file against the ledger', () => {
            for (const row of rows) {
                for (const direction of ['up', 'down'] as const) {
                    const file = files.find(
                        (candidate) =>
                            candidate.number === row.number && candidate.direction === direction,
                    );
                    expect(
                        file,
                        `missing ${fileLabel({...row, direction})} for ledger row ${row.number}`,
                    ).not.to.be.undefined;
                    expect(file?.name, `name of migration ${row.number}`).to.equal(row.name);
                    expect(
                        file?.sha256,
                        `sha256 of ${fileLabel({...row, direction})} differs from LEDGER.json`,
                    ).to.equal(direction === 'up' ? row.upSha256 : row.downSha256);
                }
            }
        });

        it('keeps released rows as a frozen contiguous prefix', () => {
            const released = rows.filter((row) => RELEASED_FROZEN_IN.includes(row.frozenIn));
            expect(released.map((row) => row.number)).to.deep.equal(
                Array.from({length: RELEASED_MAX_NUMBER}, (_, index) => index + 1),
            );
            // Nothing released may sit behind an unreleased number, and nothing may be inserted
            // into the released range.
            for (const row of rows) {
                expect(
                    RELEASED_FROZEN_IN.includes(row.frozenIn),
                    `row ${row.number} (${row.frozenIn}) breaks the released prefix`,
                ).to.equal(row.number <= RELEASED_MAX_NUMBER);
            }
        });

        it('does not change any released migration (pinned digest of the released rows)', () => {
            const digest = sha256Hex(
                rows
                    .filter((row) => RELEASED_FROZEN_IN.includes(row.frozenIn))
                    .map((row) => `${row.number}:${row.name}:${row.upSha256}:${row.downSha256}\n`)
                    .join(''),
            );
            expect(digest).to.equal(RELEASED_ROWS_DIGEST);
        });

        it('keeps adopted upstream migrations in upstream relative order', () => {
            const adopted = rows.flatMap((row) => {
                const origin = parseUpstreamOrigin(row.origin);
                return origin === undefined ? [] : [{row, origin}];
            });
            expect(adopted.length, 'no adopted upstream rows found').to.be.greaterThan(0);
            for (let index = 1; index < adopted.length; ++index) {
                const previous = adopted[index - 1];
                const current = adopted[index];
                if (previous === undefined || current === undefined) {
                    throw new Error('unreachable');
                }
                const message = `adopted rows ${previous.row.number} (${previous.row.origin}) and ${current.row.number} (${current.row.origin}) are out of upstream order`;
                expect(current.origin.tagOrder, message).to.be.at.least(previous.origin.tagOrder);
                if (current.origin.tagOrder === previous.origin.tagOrder) {
                    expect(current.origin.nativeNumber, message).to.be.greaterThan(
                        previous.origin.nativeNumber,
                    );
                }
            }
        });

        it('records every row as fork-owned or as an upstream adoption with blob ids', () => {
            for (const row of rows) {
                if (row.origin === 'fork') {
                    expect(row.upstreamBlob, `fork row ${row.number}`).to.be.null;
                } else {
                    expect(
                        parseUpstreamOrigin(row.origin),
                        `origin of row ${row.number}: ${row.origin}`,
                    ).not.to.be.undefined;
                    expect(row.upstreamBlob?.up, `up blob of row ${row.number}`).to.match(
                        /^[0-9a-f]{40}$/u,
                    );
                    expect(row.upstreamBlob?.down, `down blob of row ${row.number}`).to.match(
                        /^[0-9a-f]{40}$/u,
                    );
                }
            }
        });

        it('never ships a file under an upstream-native number that is not the row own number', () => {
            for (const row of rows) {
                const origin = parseUpstreamOrigin(row.origin);
                if (origin === undefined || origin.nativeNumber === row.number) {
                    continue;
                }
                const collisions = files.filter(
                    (file) =>
                        file.number === origin.nativeNumber && file.name === origin.nativeName,
                );
                expect(
                    collisions.map(fileLabel),
                    `upstream-native file of adopted row ${row.number} must not exist beside the renumbered copy`,
                ).to.deep.equal([]);
            }
        });

        it('only lists historical variants for numbers the ledger owns', () => {
            for (const variant of ledger.historicalVariants) {
                expect(
                    rows.some((row) => row.number === variant.number),
                    `historical variant ${variant.number}`,
                ).to.be.true;
            }
        });
    });
}
