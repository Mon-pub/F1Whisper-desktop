import {
    InnerKeyStorageV2_InnerVersion,
    IntermediateKeyStorageV1_IntermediateVersion,
    OuterKeyStorageV2_OuterVersion,
} from '~/common/internal-protobuf/key-storage-file';
import type {u16} from '~/common/types';

// The current key storage versions.
export const LATEST_OUTER_KEY_STORAGE_SCHEMA_VERSION = OuterKeyStorageV2_OuterVersion.V2_0;
export function ensureOuterKeyStorageVersion(value: u16): OuterKeyStorageV2_OuterVersion {
    const all: ReadonlySet<OuterKeyStorageV2_OuterVersion> = new Set([
        OuterKeyStorageV2_OuterVersion.V1_0,
        OuterKeyStorageV2_OuterVersion.V2_0,
    ]);
    if ((all as ReadonlySet<u16>).has(value)) {
        return value as OuterKeyStorageV2_OuterVersion;
    }

    throw new Error(`${value} is not a valid OuterKeyStorageVersion`);
}

export const LATEST_INTERMEDIATE_KEY_STORAGE_SCHEMA_VERSION =
    IntermediateKeyStorageV1_IntermediateVersion.V1_0;
export function ensureIntermediateKeyStorageVersion(
    value: u16,
): IntermediateKeyStorageV1_IntermediateVersion {
    const all: ReadonlySet<IntermediateKeyStorageV1_IntermediateVersion> = new Set([
        IntermediateKeyStorageV1_IntermediateVersion.V1_0,
    ]);
    if ((all as ReadonlySet<u16>).has(value)) {
        return value as IntermediateKeyStorageV1_IntermediateVersion;
    }

    throw new Error(`${value} is not a valid IntermediateStorageVersion`);
}

export const LATEST_INNER_KEY_STORAGE_SCHEMA_VERSION = InnerKeyStorageV2_InnerVersion.V2_0;
export function ensureInnerKeyStorageVersion(value: u16): InnerKeyStorageV2_InnerVersion {
    const all: ReadonlySet<InnerKeyStorageV2_InnerVersion> = new Set([
        InnerKeyStorageV2_InnerVersion.V1_0,
        InnerKeyStorageV2_InnerVersion.V1_1,
        InnerKeyStorageV2_InnerVersion.V2_0,
    ]);
    if ((all as ReadonlySet<u16>).has(value)) {
        return value as InnerKeyStorageV2_InnerVersion;
    }
    throw new Error(`${value} is not a valid InnerKeyStorageVersion`);
}
