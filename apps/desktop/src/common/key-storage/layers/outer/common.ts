import * as v from '@badrap/valita';

import {Argon2idParameters_Argon2Version} from '~/common/internal-protobuf/key-storage-file';
import {KiB, type u8, type u16, type u53, MiB} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import {instanceOf} from '~/common/utils/valita-helpers';

/**
 * Specify the target runtime for the KDF, as well as upper and
 * lower bounds for generating warnings (if the KDF runs slower or faster).
 */
export const KDF_TARGET_RUNTIME_MS = {
    min: 1000,
    target: 2000,
    max: 3000,
} as const;

/**
 * Argon2 minimal parameters.
 *
 * There are always two sets of parameters: The absolute minimum (validated when
 * reading a key storage) and the current minimum (used when generating a new
 * key storage).
 *
 * The minimal parameters aim to provide reasonable security even against GPU
 * based attacks, but may be increased in difficulty using a benchmark (see
 * {@link FileKeyStorage._determineKdfParams}). On old or very weak hardware these
 * parameters may exceed our goal of 2 seconds, but should still be usable (the
 * KDF will run every time the application is opened).
 *
 * To test this with the `argon2` command line program:
 *
 *     echo "pw" | argon2 asdfjklo -id -v 13 -t 3 -k $((1024*128)) -p 1
 *
 * With these parameters, the following runtimes on desktop / server hardware
 * are achieved:
 *
 * - AMD Ryzen 9 5900X: 0.207 s
 * - Intel Xeon 6140:   0.748 s
 * - Intel Atom D525:   3.526 s
 *
 * For comparison, here are some smartphones (tested with the argon2kt app):
 *
 * - Snapdragon 835 (Xiaomi Mi 6): 0.584 s
 * - Snapdragon 670 (Pixel 3a):    0.618 s
 * - Snapdragon 400 (Moto G):      4.875 s
 * - MediaTek 6589M (Fairphone 1): 3.431 s
 *
 * And on ARM based SBCs:
 *
 * - Raspberry Pi Zero W: 6.473 s
 */
export interface Argon2MinParams {
    readonly saltLengthBytes: u53;
    readonly memoryBytes: u53;
    readonly iterations: u53;
    readonly parallelism: u53;
}

export const ARGON2_MIN_PARAMS = {
    accept: {
        saltLengthBytes: 16,
        memoryBytes: 128 * MiB,
        iterations: 3,
        parallelism: 1,
    },
    create: {
        saltLengthBytes: 16,
        memoryBytes: 128 * MiB,
        iterations: 3,
        parallelism: 1,
    },
} as const satisfies {
    readonly accept: Argon2MinParams;
    readonly create: Argon2MinParams;
};

/**
 * The Argon2 version wrapper.
 *
 * Right now, only version 1.3 (0x13) is supported.
 */
export class Argon2Version {
    private constructor(private readonly _versionByte: 0x13) {}

    /**
     * Create an {@link Argon2Version} instance from an argon2 compatible version byte.
     */
    public static fromArgon2VersionByte(hexVersionByte: 0x13): Argon2Version {
        return new Argon2Version(hexVersionByte);
    }

    /**
     * Create an {@link Argon2Version} instance from a protobuf argon2 version number.
     *
     * @throws {Error} In case of an unsupported Argon2 version.
     */
    public static fromProtobuf(version: u16): Argon2Version {
        switch (version) {
            case Argon2idParameters_Argon2Version.VERSION_1_3:
                return new Argon2Version(0x13);
            case Argon2idParameters_Argon2Version.UNRECOGNIZED:
            default:
                throw new Error(`Unrecognized argon2 version in protobuf data: ${version}`);
        }
    }

    /**
     * Return the version as supported by the `argon2` library.
     */
    public toArgon2VersionByte(): u8 {
        return this._versionByte;
    }

    /**
     * Return the version as a protobuf argon2 version number.
     */
    public toProtobuf(): Argon2idParameters_Argon2Version {
        switch (this._versionByte) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            case 0x13:
                return Argon2idParameters_Argon2Version.VERSION_1_3;
            default:
                return unreachable(this._versionByte);
        }
    }
}

/**
 * Validation schema for Argon2id KDF parameters as stored in the outer key storage.
 *
 * @throws {ValitaError} In case validation fails.
 */
export const ARGON2ID_PARAMETERS_SCHEMA = v
    .object({
        // Argon2 implementation version.
        version: v.number().map((version) => Argon2Version.fromProtobuf(version)),
        // Random salt.
        salt: instanceOf(Uint8Array).assert(
            (salt) => salt.byteLength >= ARGON2_MIN_PARAMS.accept.saltLengthBytes,
            `Argon2id salt must be ≥ ${ARGON2_MIN_PARAMS.accept.saltLengthBytes} bytes`,
        ),
        // Memory usage in bytes.
        memoryBytes: v
            .number()
            .assert(
                (memoryBytes) => memoryBytes >= import.meta.env.ARGON2_MIN_MEMORY_BYTES,
                `Argon2id memoryBytes must be ≥ ${Math.round(
                    import.meta.env.ARGON2_MIN_MEMORY_BYTES / KiB,
                )} KiB`,
            ),
        // Number of iterations.
        iterations: v
            .number()
            .assert(
                (iterations) => iterations >= ARGON2_MIN_PARAMS.accept.iterations,
                `Argon2id iterations must be ≥ ${ARGON2_MIN_PARAMS.accept.iterations}`,
            ),
        // Degree of parallelism.
        parallelism: v
            .number()
            .assert(
                (parallelism) => parallelism >= ARGON2_MIN_PARAMS.accept.parallelism,
                `Argon2id parallelism must be ≥ ${ARGON2_MIN_PARAMS.accept.parallelism}`,
            ),
    })
    .rest(v.unknown());

/**
 * Validated Argon2id KDF parameters.
 */
export type Argon2idParameters = Readonly<v.Infer<typeof ARGON2ID_PARAMETERS_SCHEMA>>;
