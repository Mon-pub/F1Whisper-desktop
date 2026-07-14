import * as fs from 'node:fs';
import * as inspector from 'node:inspector';
import * as path from 'node:path';

import initLibthreema, * as libthreema from '@threema/libthreema-wasm';

import {STATIC_CONFIG} from '~/common/config';
import type {RawDatabaseKey, ServicesForDatabaseFactory} from '~/common/db';
import type {ServicesForFileStorageFactory} from '~/common/file-storage';
import type {ServicesForKeyStorageFactory} from '~/common/key-storage';
import {
    CONSOLE_LOGGER,
    createLoggerStyle,
    type Logger,
    type LoggerFactory,
    TagLogger,
    TeeLogger,
} from '~/common/logging';
import {ZlibCompressor} from '~/common/node/compressor';
import type {DbMigrationSupplements} from '~/common/node/db/migrations';
import {SqliteDatabaseBackend} from '~/common/node/db/sqlite';
import {loadElectronSettings} from '~/common/node/electron-settings';
import {FileSystemFileStorage} from '~/common/node/file-storage/system-file-storage';
import {TempFileSystemFileStorage} from '~/common/node/file-storage/temp-system-file-storage';
import {directoryModeInternalObjectIfPosix} from '~/common/node/fs';
import {FileSystemKeyStorage} from '~/common/node/key-storage';
import {getIsAnyKeyStorageFilePresent, getKeyStoragePath} from '~/common/node/key-storage/helpers';
import {FileLogger} from '~/common/node/logging';
import {assert, ensureError} from '~/common/utils/assert';
import {main} from '~/worker/backend/backend-worker';
import {BACKEND_WORKER_CONFIG} from '~/worker/backend/config';
import {INITIAL_MESSAGE_SCHEME, type InitialMessage} from '~/worker/backend/electron/types';

/**
 * Number of milliseconds to profile the backend worker after start. Generously covers the startup
 * phase; because the worker has no reliable teardown hook, the profile is written when this elapses.
 */
const WORKER_PROFILER_DURATION_MS = 60_000;

/**
 * Start CPU profiling of the backend worker via an in-process inspector session and write the
 * resulting `.cpuprofile` into the backend worker log directory after a fixed startup window.
 * Errors are logged (to `log`, i.e. debug-bw.log) and swallowed. No-op is handled by the caller
 * (only invoked when opted-in).
 */
function startWorkerProfiler(appPath: string, log: Logger): void {
    const logDir = path.dirname(path.join(appPath, ...import.meta.env.LOG_PATH.BACKEND_WORKER));
    let session: inspector.Session;
    try {
        session = new inspector.Session();
        session.connect();
    } catch (error) {
        // Expected on Electron: the backend worker runs in a Chromium worker (nodeIntegrationInWorker)
        // whose environment has no V8::Inspector, so `node:inspector` cannot profile it. This is a
        // known platform limitation, not a bug. The worker's startup timing is instead observable
        // from its timestamped log lines (KDF duration, DB open, connection) in this same log file.
        log.warn(
            `CPU profiling of the backend worker is unavailable on this platform (${ensureError(error).message}); use the timestamped worker log lines for startup timing instead`,
        );
        return;
    }
    session.post('Profiler.enable', (enableError) => {
        if (enableError !== null) {
            log.error(`Failed to enable backend worker profiler: ${enableError.message}`);
            session.disconnect();
            return;
        }
        session.post('Profiler.start', (startError) => {
            if (startError !== null) {
                log.error(`Failed to start backend worker profiler: ${startError.message}`);
                session.disconnect();
                return;
            }
            log.info('Backend worker CPU profiler started');
        });
    });

    setTimeout(() => {
        session.post('Profiler.stop', (stopError, result) => {
            if (stopError !== null) {
                log.error(`Failed to stop backend worker profiler: ${stopError.message}`);
                session.disconnect();
                return;
            }
            const timestamp = new Date().toISOString().replaceAll(':', '-').replace('.', '-');
            const filePath = path.join(logDir, `profile-worker-${timestamp}.cpuprofile`);
            try {
                fs.mkdirSync(logDir, {recursive: true, ...directoryModeInternalObjectIfPosix()});
                fs.writeFileSync(filePath, JSON.stringify(result.profile));
                log.info(`Backend worker CPU profile written to ${filePath}`);
            } catch (writeError) {
                log.error('Failed to write backend worker CPU profile:', writeError);
            }
            session.disconnect();
        });
    }, WORKER_PROFILER_DURATION_MS);
}

export async function run(): Promise<void> {
    // We need the app path before we can do anything.
    // Note: The path is sent from the app initialization code in src/app/app.ts
    const {appPath, oldProfilePath, profiler}: InitialMessage = await new Promise((resolve) => {
        function appPathListener({data}: MessageEvent<unknown>): void {
            self.removeEventListener('message', appPathListener);

            // We make sure that the data received is of the correct type by assertions, since
            // the types specified above could fool us here.
            const validatedMessage = INITIAL_MESSAGE_SCHEME.parse(data);
            resolve({
                appPath: validatedMessage.appPath,
                oldProfilePath: validatedMessage.oldProfilePath,
                profiler: validatedMessage.profiler,
            });
        }
        self.addEventListener('message', appPathListener);
    });

    // Read electron settings
    const electronSettings = loadElectronSettings(appPath, {process: 'worker', log: undefined});

    // Try to create a file logger
    let fileLogger: FileLogger | undefined;
    if (electronSettings.logging.enabled) {
        const logPath = import.meta.env.LOG_PATH.BACKEND_WORKER;
        const logFilePath = path.join(appPath, ...logPath);
        try {
            fs.mkdirSync(path.dirname(logFilePath), {
                recursive: true,
                ...directoryModeInternalObjectIfPosix(),
            });
            fileLogger = await FileLogger.create(logFilePath);
        } catch (error) {
            CONSOLE_LOGGER.error(`Unable to create file logger (path: '${logFilePath}'):`, error);
        }
    }

    function loggerFactory(rootTag: string, defaultStyle: string): LoggerFactory {
        const tagLogging = TagLogger.styled(CONSOLE_LOGGER, rootTag, defaultStyle);
        if (fileLogger === undefined) {
            return tagLogging;
        }
        return TeeLogger.factory([tagLogging, TagLogger.unstyled(fileLogger, rootTag)]);
    }

    // Local logger for initialization code
    const logging = loggerFactory('bw', BACKEND_WORKER_CONFIG.LOG_DEFAULT_STYLE);
    const initLog = logging.logger('init');
    initLog.info(`File logging is ${electronSettings.logging.enabled ? 'enabled' : 'disabled'}`);

    // Start CPU profiling of the backend worker (opt-in via `--threema-profiler=true`). Started here
    // (right after logger setup, a few ms into startup) so its start/stop/write/error messages land
    // in debug-bw.log via the real logger. Because the worker is torn down together with the
    // renderer (no reliable before-quit), the profile is stopped and written on a fixed timer that
    // generously covers the startup phase.
    if (profiler === true) {
        startWorkerProfiler(appPath, initLog);
    }

    // Initialize WASM packages
    initLog.debug('Initializing WASM packages');
    await initLibthreema();
    const libthreemaLog = logging.logger('libthreema', createLoggerStyle('#5c2751', '#ffffff'));
    libthreema.init(
        {handle: (info: string) => libthreemaLog.error('PANIC!', info)},
        {
            debug: libthreemaLog.debug.bind(libthreemaLog),
            info: libthreemaLog.info.bind(libthreemaLog),
            warn: libthreemaLog.warn.bind(libthreemaLog),
            error: libthreemaLog.error.bind(libthreemaLog),
        },
        import.meta.env.DEBUG ? 'debug' : 'info',
    );

    // Start backend worker for Electron
    main({
        hasIdentity: () => getIsAnyKeyStorageFilePresent(appPath),

        logging: loggerFactory,

        keyStorage: (
            services: ServicesForKeyStorageFactory,
            log: Logger,
            loadFromOldProfile?: boolean,
        ) => {
            const profileDirectoryPath = loadFromOldProfile === true ? oldProfilePath : appPath;
            assert(
                profileDirectoryPath !== undefined,
                'Cannot create the key storage from an undefined path',
            );

            // Create parent directory for the key storage if it doesn't exist.
            const keyStoragePath = getKeyStoragePath(profileDirectoryPath);
            fs.mkdirSync(path.dirname(keyStoragePath), {
                recursive: true,
                ...directoryModeInternalObjectIfPosix(),
            });

            return new FileSystemKeyStorage(services, log, profileDirectoryPath);
        },

        fileStorage: (
            services: ServicesForFileStorageFactory,
            log: Logger,
            loadFromOldProfile?: boolean,
        ) => {
            const basePath = loadFromOldProfile === true ? oldProfilePath : appPath;
            assert(basePath !== undefined, 'Cannot create the key storage from an undefined path');
            const fileStoragePath = path.join(basePath, ...STATIC_CONFIG.FILE_STORAGE_PATH);
            fs.mkdirSync(fileStoragePath, {
                recursive: true,
                ...directoryModeInternalObjectIfPosix(),
            });
            return new FileSystemFileStorage(services, log, fileStoragePath);
        },

        tempFileStorage: (log: Logger) => {
            const fileStoragePath = path.join(appPath, 'temp');
            fs.mkdirSync(fileStoragePath, {
                recursive: true,
                ...directoryModeInternalObjectIfPosix(),
            });
            return new TempFileSystemFileStorage(log, fileStoragePath);
        },

        compressor: () => new ZlibCompressor(),

        db: (
            services: ServicesForDatabaseFactory,
            log: Logger,
            migrationSupplementaryInformation: DbMigrationSupplements,
            key: RawDatabaseKey,
            shouldExist: boolean,
            loadFromOldProfile?: boolean,
        ) => {
            const {config} = services;

            // Process database path
            let databasePath;
            if (config.DATABASE_PATH === ':memory:') {
                log.info('Using in-memory database');
                databasePath = ':memory:';
            } else {
                const basePath = loadFromOldProfile === true ? oldProfilePath : appPath;
                assert(
                    basePath !== undefined,
                    'Cannot create the key storage from an undefined path',
                );
                databasePath = path.join(basePath, ...config.DATABASE_PATH);
                if (!shouldExist) {
                    // Ensure that database does not exist. If necessary, remove leftover files from
                    // an incomplete join process.
                    fs.rmSync(databasePath, {force: true});
                } else {
                    // TODO(DESK-383): If `shouldExist` is true but DB does not exist, gracefully return to
                    // the UI, etc.
                }
            }

            // Instantiate backend
            const backend = SqliteDatabaseBackend.create(
                log,
                migrationSupplementaryInformation,
                databasePath,
                key,
            );

            // Run migrations
            backend.runMigrations();

            // Run a quick database self-test
            backend.checkIntegrity();

            return backend;
        },
    });

    // Let the app know that we're ready to initialise.
    //
    // Note: This is required because otherwise the app would race with our above `await` call and
    //       send us the initial data before the listener is even registered.
    self.postMessage(undefined);
}
