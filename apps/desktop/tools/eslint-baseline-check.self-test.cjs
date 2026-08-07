#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const process = require('node:process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CHECKER = path.join(__dirname, 'eslint-baseline-check.cjs');
const BASELINE = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'config', 'eslint-baseline.json'), {encoding: 'utf8'}),
);

function makeReport(diagnostics) {
    const files = new Map();
    for (const diagnostic of diagnostics) {
        let result = files.get(diagnostic.filePath);
        if (result === undefined) {
            result = {
                filePath: path.join(PACKAGE_ROOT, ...diagnostic.filePath.split('/')),
                messages: [],
                errorCount: 0,
                warningCount: 0,
                fatalErrorCount: 0,
            };
            files.set(diagnostic.filePath, result);
        }
        for (let index = 0; index < diagnostic.count; index += 1) {
            result.messages.push({
                ruleId: diagnostic.ruleId,
                severity: 2,
                message: diagnostic.message,
                line: index + 1,
                column: 1,
                endLine: index + 1,
                endColumn: 2,
            });
            result.errorCount += 1;
        }
    }
    return [...files.values()];
}

function runChecker(
    tempDirectory,
    name,
    reportContents,
    eslintStatus,
    expectedStatus,
    outputPattern,
) {
    const reportPath = path.join(tempDirectory, `${name}.json`);
    fs.writeFileSync(
        reportPath,
        typeof reportContents === 'string' ? reportContents : `${JSON.stringify(reportContents)}\n`,
        {encoding: 'utf8'},
    );
    const result = childProcess.spawnSync(process.execPath, [CHECKER, reportPath, eslintStatus], {
        encoding: 'utf8',
    });
    const output = `${result.stdout}${result.stderr}`;
    if (result.status !== expectedStatus || !outputPattern.test(output)) {
        throw new Error(
            `${name}: expected status ${expectedStatus} and output ${outputPattern}, got status ${result.status}\n${output}`,
        );
    }
}

function main() {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-baseline-check-'));
    let checks = 0;
    function check(...args) {
        runChecker(tempDirectory, ...args);
        checks += 1;
    }

    try {
        const exact = makeReport(BASELINE.diagnostics);
        check('exact-baseline', exact, '1', 0, /baseline gate OK/u);

        const reducedDiagnostics = structuredClone(BASELINE.diagnostics);
        reducedDiagnostics[0].count -= 1;
        check('reduction', makeReport(reducedDiagnostics), '1', 0, /baseline gate OK/u);

        const clean = [
            {
                filePath: path.join(PACKAGE_ROOT, 'package.json'),
                messages: [],
                errorCount: 0,
                warningCount: 0,
                fatalErrorCount: 0,
            },
        ];
        check('all-reduced', clean, '0', 0, /0\/70 error/u);

        const substituted = structuredClone(BASELINE.diagnostics);
        substituted[0].message = `${substituted[0].message} substituted`;
        check('substitution', makeReport(substituted), '1', 1, /new, substituted/u);

        const duplicated = structuredClone(BASELINE.diagnostics);
        duplicated[0].count += 1;
        check('duplicate', makeReport(duplicated), '1', 1, /actual 2, baseline 1/u);

        check('empty-file', '', '0', 2, /report is empty/u);
        check('malformed-json', '{', '0', 2, /not valid JSON/u);
        check('empty-report', [], '0', 2, /non-empty array/u);

        const fatal = [
            {
                filePath: path.join(PACKAGE_ROOT, 'package.json'),
                messages: [
                    {
                        ruleId: null,
                        severity: 2,
                        fatal: true,
                        message: 'Parsing failed',
                        line: 1,
                        column: 1,
                    },
                ],
                errorCount: 1,
                warningCount: 0,
                fatalErrorCount: 1,
            },
        ];
        check('fatal-report', fatal, '1', 2, /fatal diagnostic/u);

        const inconsistentTotals = structuredClone(exact);
        inconsistentTotals[0].errorCount += 1;
        check('inconsistent-totals', inconsistentTotals, '1', 2, /does not match/u);
        check('bad-eslint-status', exact, '2', 2, /must be 0 or 1/u);
        check('status-zero-with-errors', exact, '0', 2, /inconsistent/u);
        check('status-one-without-errors', clean, '1', 2, /inconsistent/u);
        check('nonnumeric-status', exact, 'oops', 2, /must be 0 or 1/u);
    } finally {
        fs.rmSync(tempDirectory, {recursive: true, force: true});
    }

    console.log(`✓ ESLint baseline checker self-test passed ${checks} cases.`);
}

main();
