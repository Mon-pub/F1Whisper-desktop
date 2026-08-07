#!/usr/bin/env node

/**
 * Compare an ESLint JSON report with the normalized PR3-M08 diagnostic multiset.
 *
 * Diagnostic locations and absolute checkout prefixes are intentionally excluded from identity.
 * This keeps known debt stable when nearby code moves while still pinning the package-relative file,
 * rule, message, and multiplicity. Removing baseline diagnostics is allowed; adding, substituting,
 * or duplicating one is not.
 *
 * Usage: node tools/eslint-baseline-check.cjs <eslint-report.json> <eslint-exit-status>
 */

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const BASELINE_FILE = path.join(PACKAGE_ROOT, 'config', 'eslint-baseline.json');

class InvalidInputError extends Error {}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(filePath, label) {
    let contents;
    try {
        contents = fs.readFileSync(filePath, {encoding: 'utf8'});
    } catch (error) {
        throw new InvalidInputError(`${label} cannot be read at ${filePath}: ${error.message}`);
    }
    if (contents.trim() === '') {
        throw new InvalidInputError(`${label} is empty`);
    }
    try {
        return JSON.parse(contents);
    } catch (error) {
        throw new InvalidInputError(`${label} is not valid JSON: ${error.message}`);
    }
}

function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new InvalidInputError(`${label} must be a non-negative safe integer`);
    }
}

function diagnosticKey(diagnostic) {
    return JSON.stringify([diagnostic.filePath, diagnostic.ruleId, diagnostic.message]);
}

function validateBaseline(value) {
    if (!isRecord(value)) {
        throw new InvalidInputError('ESLint baseline must be an object');
    }
    if (typeof value.checkpoint !== 'string' || !/^[0-9a-f]{40}$/u.test(value.checkpoint)) {
        throw new InvalidInputError(
            'ESLint baseline checkpoint must be a full lowercase commit hash',
        );
    }
    requireNonNegativeInteger(value.errorCount, 'ESLint baseline errorCount');
    if (value.errorCount === 0) {
        throw new InvalidInputError('ESLint baseline errorCount must be nonzero');
    }
    if (!Array.isArray(value.diagnostics) || value.diagnostics.length === 0) {
        throw new InvalidInputError('ESLint baseline diagnostics must be a non-empty array');
    }

    const counts = new Map();
    let total = 0;
    for (const [index, diagnostic] of value.diagnostics.entries()) {
        const label = `ESLint baseline diagnostics[${index}]`;
        if (!isRecord(diagnostic)) {
            throw new InvalidInputError(`${label} must be an object`);
        }
        if (
            typeof diagnostic.filePath !== 'string' ||
            diagnostic.filePath === '' ||
            path.posix.isAbsolute(diagnostic.filePath) ||
            diagnostic.filePath.includes('\\') ||
            path.posix.normalize(diagnostic.filePath) !== diagnostic.filePath ||
            diagnostic.filePath.startsWith('../')
        ) {
            throw new InvalidInputError(
                `${label}.filePath must be a normalized package-relative path`,
            );
        }
        if (typeof diagnostic.ruleId !== 'string' || diagnostic.ruleId === '') {
            throw new InvalidInputError(`${label}.ruleId must be a non-empty string`);
        }
        if (typeof diagnostic.message !== 'string' || diagnostic.message === '') {
            throw new InvalidInputError(`${label}.message must be a non-empty string`);
        }
        requireNonNegativeInteger(diagnostic.count, `${label}.count`);
        if (diagnostic.count === 0) {
            throw new InvalidInputError(`${label}.count must be nonzero`);
        }
        const key = diagnosticKey(diagnostic);
        if (counts.has(key)) {
            throw new InvalidInputError(`${label} duplicates another normalized diagnostic`);
        }
        counts.set(key, diagnostic.count);
        total += diagnostic.count;
    }
    if (total !== value.errorCount) {
        throw new InvalidInputError(
            `ESLint baseline errorCount ${value.errorCount} does not match diagnostic total ${total}`,
        );
    }
    return {checkpoint: value.checkpoint, errorCount: value.errorCount, counts};
}

function normalizeReportPath(filePath, label) {
    if (typeof filePath !== 'string' || filePath === '') {
        throw new InvalidInputError(`${label}.filePath must be a non-empty string`);
    }
    const absolutePath = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.resolve(PACKAGE_ROOT, filePath);
    const relativePath = path.relative(PACKAGE_ROOT, absolutePath);
    if (
        relativePath === '' ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
    ) {
        throw new InvalidInputError(`${label}.filePath is outside the desktop package`);
    }
    return relativePath.split(path.sep).join('/');
}

function validateMessage(message, label) {
    if (!isRecord(message)) {
        throw new InvalidInputError(`${label} must be an object`);
    }
    if (!Number.isInteger(message.severity) || message.severity < 0 || message.severity > 2) {
        throw new InvalidInputError(`${label}.severity must be 0, 1, or 2`);
    }
    if (typeof message.message !== 'string' || message.message === '') {
        throw new InvalidInputError(`${label}.message must be a non-empty string`);
    }
    if (message.fatal !== undefined && typeof message.fatal !== 'boolean') {
        throw new InvalidInputError(`${label}.fatal must be a boolean when present`);
    }
}

function validateReport(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new InvalidInputError('ESLint report must be a non-empty array');
    }

    const diagnostics = [];
    const seenFiles = new Set();
    let totalErrors = 0;
    let totalFatals = 0;
    for (const [fileIndex, result] of value.entries()) {
        const label = `ESLint report[${fileIndex}]`;
        if (!isRecord(result)) {
            throw new InvalidInputError(`${label} must be an object`);
        }
        const filePath = normalizeReportPath(result.filePath, label);
        if (seenFiles.has(filePath)) {
            throw new InvalidInputError(`${label}.filePath duplicates another report entry`);
        }
        seenFiles.add(filePath);
        if (!Array.isArray(result.messages)) {
            throw new InvalidInputError(`${label}.messages must be an array`);
        }
        requireNonNegativeInteger(result.errorCount, `${label}.errorCount`);
        requireNonNegativeInteger(result.warningCount, `${label}.warningCount`);
        requireNonNegativeInteger(result.fatalErrorCount, `${label}.fatalErrorCount`);

        let errors = 0;
        let warnings = 0;
        let fatals = 0;
        for (const [messageIndex, message] of result.messages.entries()) {
            const messageLabel = `${label}.messages[${messageIndex}]`;
            validateMessage(message, messageLabel);
            if (message.severity === 2) {
                errors += 1;
            } else if (message.severity === 1) {
                warnings += 1;
            }
            if (message.fatal === true) {
                fatals += 1;
            }
            if (message.severity !== 2 || message.fatal === true) {
                continue;
            }
            if (typeof message.ruleId !== 'string' || message.ruleId === '') {
                throw new InvalidInputError(
                    `${messageLabel}.ruleId must identify a non-fatal error`,
                );
            }
            diagnostics.push({filePath, ruleId: message.ruleId, message: message.message});
        }
        if (errors !== result.errorCount) {
            throw new InvalidInputError(
                `${label}.errorCount ${result.errorCount} does not match its ${errors} error messages`,
            );
        }
        if (warnings !== result.warningCount) {
            throw new InvalidInputError(
                `${label}.warningCount ${result.warningCount} does not match its ${warnings} warning messages`,
            );
        }
        if (fatals !== result.fatalErrorCount) {
            throw new InvalidInputError(
                `${label}.fatalErrorCount ${result.fatalErrorCount} does not match its ${fatals} fatal messages`,
            );
        }
        totalErrors += errors;
        totalFatals += fatals;
    }
    if (totalFatals > 0) {
        throw new InvalidInputError(`ESLint report contains ${totalFatals} fatal diagnostic(s)`);
    }
    return {diagnostics, totalErrors};
}

function validateStatus(rawStatus, totalErrors) {
    if (!/^(?:0|1)$/u.test(rawStatus)) {
        throw new InvalidInputError(
            `ESLint exit status must be 0 or 1 (received ${JSON.stringify(rawStatus)})`,
        );
    }
    const status = Number(rawStatus);
    const expectedStatus = totalErrors === 0 ? 0 : 1;
    if (status !== expectedStatus) {
        throw new InvalidInputError(
            `ESLint exit status ${status} is inconsistent with ${totalErrors} reported error(s); expected ${expectedStatus}`,
        );
    }
}

function compareDiagnostics(baseline, report) {
    const actualCounts = new Map();
    const byKey = new Map();
    for (const diagnostic of report.diagnostics) {
        const key = diagnosticKey(diagnostic);
        actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
        byKey.set(key, diagnostic);
    }

    const violations = [];
    for (const [key, actualCount] of actualCounts) {
        const allowedCount = baseline.counts.get(key) ?? 0;
        if (actualCount > allowedCount) {
            violations.push({
                diagnostic: byKey.get(key),
                actualCount,
                allowedCount,
            });
        }
    }
    return violations.sort((left, right) =>
        diagnosticKey(left.diagnostic).localeCompare(diagnosticKey(right.diagnostic)),
    );
}

function main() {
    const [reportPath, rawStatus, ...extraArguments] = process.argv.slice(2);
    if (reportPath === undefined || rawStatus === undefined || extraArguments.length > 0) {
        console.error(
            'Usage: node tools/eslint-baseline-check.cjs <eslint-report.json> <eslint-exit-status>',
        );
        return 2;
    }

    try {
        const baseline = validateBaseline(readJson(BASELINE_FILE, 'ESLint baseline'));
        const report = validateReport(readJson(reportPath, 'ESLint report'));
        validateStatus(rawStatus, report.totalErrors);
        const violations = compareDiagnostics(baseline, report);
        if (violations.length > 0) {
            console.error(
                `✖ ESLint report has ${violations.length} new, substituted, or over-duplicated normalized diagnostic(s):`,
            );
            for (const {diagnostic, actualCount, allowedCount} of violations) {
                console.error(
                    `  ${diagnostic.filePath} :: ${diagnostic.ruleId} :: ${diagnostic.message} (actual ${actualCount}, baseline ${allowedCount})`,
                );
            }
            return 1;
        }
        console.log(
            `✓ ESLint baseline gate OK: ${report.totalErrors}/${baseline.errorCount} error(s) remain from checkpoint ${baseline.checkpoint}; no new diagnostics.`,
        );
        return 0;
    } catch (error) {
        if (error instanceof InvalidInputError) {
            console.error(
                `✖ ESLint baseline gate could not validate its inputs: ${error.message}`,
            );
            return 2;
        }
        throw error;
    }
}

if (require.main === module) {
    process.exitCode = main();
}
