/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";

export interface DeviceIds {
  /** The device ID used towards the mediator server */
  d2mDeviceId: Long;
  /** The device ID used towards the chat server */
  cspDeviceId: Long;
}

export interface IdentityData {
  /** The Threema ID string */
  identity: string;
  /** The permanent client key associated to the Threema ID (32 bytes) */
  ck: Uint8Array;
  /** The server group associated to the Threema ID (1 byte) */
  serverGroup: string;
}

export interface OnPremConfig {
  oppfUrl: string;
  lastUpdated: Long;
  oppfCachedConfig: string;
}

export interface ThreemaWorkCredentials {
  username: string;
  password: string;
}

export interface InnerKeyStorageV1 {
  /**
   * The key storage schema version. Used for being able to migrate the storage
   * format.
   */
  schemaVersion: number;
  /** Data associated to the Threema ID */
  identityData:
    | IdentityData
    | undefined;
  /** The device group key (32 bytes) */
  dgk: Uint8Array;
  /** The SQLCipher database encryption key (32 bytes) */
  databaseKey: Uint8Array;
  /** Device IDs */
  deviceIds:
    | DeviceIds
    | undefined;
  /** The device cookie (16 bytes) */
  deviceCookie?:
    | Uint8Array
    | undefined;
  /** Threema Work Credentials (if any) */
  workCredentials:
    | ThreemaWorkCredentials
    | undefined;
  /** Threema OnPrem Config (if any) */
  onPremConfig: OnPremConfig | undefined;
}

/**
 * Inner key storage V2, encoded in the following way:
 *
 * 1. Let `data` be the result of encoding this key storage to bytes.
 * 2. Let `version` be the selected `InnerVersion.V2_X` version.
 * 3. Return `u16-le(version) || data`.
 */
export interface InnerKeyStorageV2 {
  /** Data associated to the Threema ID */
  identityData:
    | IdentityData
    | undefined;
  /** Threema Work Credentials (if any) */
  workCredentials:
    | ThreemaWorkCredentials
    | undefined;
  /** The device group key (32 bytes) */
  dgk: Uint8Array;
  /** The SQLCipher database encryption key (32 bytes) */
  databaseKey: Uint8Array;
  /** Device IDs */
  deviceIds:
    | DeviceIds
    | undefined;
  /** The device cookie (16 bytes) */
  deviceCookie: Uint8Array;
  /** Threema OnPrem config (if any) */
  onPremConfig: OnPremConfig | undefined;
}

export const InnerKeyStorageV2_InnerVersion = {
  /** V1_0 - Initial version */
  V1_0: 0,
  /**
   * V1_1 - Changes to the previous version:
   *
   * - Add string-based server group to replace numeric server group
   */
  V1_1: 1,
  /**
   * V2_0 - Changes to the previous version:
   *
   * - Externalise version number
   * - Removed deprecated server group
   * - Made device cookie mandatory
   */
  V2_0: 2,
  UNRECOGNIZED: -1,
} as const;

export type InnerKeyStorageV2_InnerVersion =
  typeof InnerKeyStorageV2_InnerVersion[keyof typeof InnerKeyStorageV2_InnerVersion];

export namespace InnerKeyStorageV2_InnerVersion {
  export type V1_0 = typeof InnerKeyStorageV2_InnerVersion.V1_0;
  export type V1_1 = typeof InnerKeyStorageV2_InnerVersion.V1_1;
  export type V2_0 = typeof InnerKeyStorageV2_InnerVersion.V2_0;
  export type UNRECOGNIZED = typeof InnerKeyStorageV2_InnerVersion.UNRECOGNIZED;
}

/**
 * Intermediate key storage V1, encoded in the following way:
 *
 * 1. Let `data` be the result of encoding this key storage to bytes.
 * 2. Let `version` be the selected `IntermediateVersion.V1_X` version.
 * 3. Return `u16-le(version) || data`.
 */
export interface IntermediateKeyStorageV1 {
  inner?: { $case: "plaintextInner"; plaintextInner: Uint8Array } | {
    $case: "remoteSecretProtectedInner";
    remoteSecretProtectedInner: IntermediateKeyStorageV1_RemoteSecretProtected;
  } | undefined;
}

export const IntermediateKeyStorageV1_IntermediateVersion = {
  /** V1_0 - Initial version */
  V1_0: 0,
  UNRECOGNIZED: -1,
} as const;

export type IntermediateKeyStorageV1_IntermediateVersion =
  typeof IntermediateKeyStorageV1_IntermediateVersion[keyof typeof IntermediateKeyStorageV1_IntermediateVersion];

export namespace IntermediateKeyStorageV1_IntermediateVersion {
  export type V1_0 = typeof IntermediateKeyStorageV1_IntermediateVersion.V1_0;
  export type UNRECOGNIZED = typeof IntermediateKeyStorageV1_IntermediateVersion.UNRECOGNIZED;
}

export interface IntermediateKeyStorageV1_RemoteSecretProtected {
  /** Associated remote secret authentication token */
  remoteSecretAuthenticationToken: Uint8Array;
  /** Associated remote secret hash */
  remoteSecretHash: Uint8Array;
  /**
   * Cached URL for fetching the remote secret, only relevant for OnPrem.
   *
   * Empty string if not OnPrem.
   *
   * If OnPrem, this endpoint URL must be updated to a non-empty string
   * whenever the respective URL in the OPPF file is changed.
   */
  onPremCachedRemoteSecretEndpointUrl: string;
  /**
   * Encapsulated compatible, version-prefixed inner key storage, encrypted
   * and encoded in the following way:
   *
   * 1. Let `RS` be the remote secret.
   * 2. Let `RSSK` be the result of
   *    `BLAKE2b(key=RS, salt='rssk-d', personal='3ma-rs')`.
   * 3. Let `inner` be the plaintext `Inner`, encoded to bytes.
   * 4. Let `nonce` be a random nonce.
   * 5. Let `encrypted-inner` be the result of encrypting `inner` by
   *    `XSalsa20-Poly1305(key=RSSK, nonce)`.
   * 6. Set this field to `nonce || encrypted-inner` (i.e. an
   *    `extra.crypto.encrypted-data-with-nonce-ahead` struct).
   */
  encryptedInner: Uint8Array;
}

export interface OuterKeyStorageV1 {
  /**
   * The key storage schema version. Used for being able to migrate the storage
   * format.
   */
  schemaVersion: number;
  /**
   * Contains the key storage (`KeyStorage`), encrypted and encoded in the
   * following way:
   *
   * 1. Let `plain_storage` be the plaintext `KeyStorage`, encoded to bytes.
   * 2. Let `sk` be a 32 byte secret key derived by running the chosen KDF
   *    with its parameters and the user-provided passphrase.
   * 3. Let `nonce` be a random nonce.
   * 4. Let `encrypted_storage` be the result of an NaCl box encryption with
   *    `sk` as the secret key, `nonce` as the nonce and `plain_storage` as
   *    data.
   * 5. Set `encrypted_key_storage` to `nonce || encrypted_storage` (i.e. a
   *    `extra.crypto.encrypted-data-with-nonce-ahead` struct).
   */
  encryptedKeyStorage: Uint8Array;
  kdfParameters?: { $case: "argon2id"; argon2id: OuterKeyStorageV1_Argon2idParameters } | undefined;
}

/**
 * Argon2id parameters.
 *
 * We currently recommend to use the following minimum parameter values:
 *
 * - Memory: At least 128 MiB
 * - Iterations: At least 3
 *
 * Ideally, the parameters are tuned for the system in the following way:
 *
 * 1. Choose a maximum `time` the algorithm should run. For our use case,
 *    ~2s at application startup are acceptable.
 * 2. Figure out the an appropriate `memory` value based on weak target
 *    hardware.
 * 3. Run Argon2id and increase the number of `memory` and `iterations`
 *    until the targeted `time` is roughly matched.
 */
export interface OuterKeyStorageV1_Argon2idParameters {
  version: OuterKeyStorageV1_Argon2idParameters_Argon2Version;
  /** Random salt (≥ 16 bytes, recommended to be 16 bytes) */
  salt: Uint8Array;
  /** Memory usage in bytes (≥ 128 MiB) */
  memoryBytes: number;
  /** Number of iterations (≥ 3) */
  iterations: number;
  /** Amount of parallelism (≥ 1, recommended to be 1) */
  parallelism: number;
}

/** Version of Argon2 */
export const OuterKeyStorageV1_Argon2idParameters_Argon2Version = { VERSION_1_3: 0, UNRECOGNIZED: -1 } as const;

export type OuterKeyStorageV1_Argon2idParameters_Argon2Version =
  typeof OuterKeyStorageV1_Argon2idParameters_Argon2Version[
    keyof typeof OuterKeyStorageV1_Argon2idParameters_Argon2Version
  ];

export namespace OuterKeyStorageV1_Argon2idParameters_Argon2Version {
  export type VERSION_1_3 = typeof OuterKeyStorageV1_Argon2idParameters_Argon2Version.VERSION_1_3;
  export type UNRECOGNIZED = typeof OuterKeyStorageV1_Argon2idParameters_Argon2Version.UNRECOGNIZED;
}

/**
 * Outer key storage V2, encoded in the following way:
 *
 * 1. Let `data` be the result of encoding this key storage to bytes.
 * 2. Let `version` be the selected `OuterVersion.V2_X` version.
 * 3. Return `u16-le(version) || data`.
 */
export interface OuterKeyStorageV2 {
  kdfParameters?:
    | { $case: "argon2id"; argon2id: OuterKeyStorageV2_Argon2idParameters }
    | undefined;
  /**
   * Encapsulated compatible, version-prefixed intermediate key storage,
   * encrypted and encoded in the following way:
   *
   * 1. Let `SK` be a 32 byte secret key derived by running the chosen KDF
   *    with its parameters and the user-provided passphrase.
   * 2. Let `nonce` be a random nonce.
   * 3. Let `intermediate` be a compatible, version-prefixed intermediate key
   *    storage encoded to bytes.
   * 4. Let `encrypted-intermediate` be the result of encrypting `intermediate`
   *    by `XSalsa20-Poly1305(key=SK, nonce)`.
   * 5. Set this field to `nonce || encrypted-intermediate` (i.e. an
   *    `extra.crypto.encrypted-data-with-nonce-ahead` struct).
   */
  encryptedIntermediate: Uint8Array;
}

export const OuterKeyStorageV2_OuterVersion = {
  /** V1_0 - Initial version */
  V1_0: 0,
  /**
   * V2_0 - Changes to the previous version:
   *
   * - Externalise version number
   *
   * NOTE: This is a non-backward compatible change so it resulted in a
   * new key storage file being written.
   */
  V2_0: 1,
  UNRECOGNIZED: -1,
} as const;

export type OuterKeyStorageV2_OuterVersion =
  typeof OuterKeyStorageV2_OuterVersion[keyof typeof OuterKeyStorageV2_OuterVersion];

export namespace OuterKeyStorageV2_OuterVersion {
  export type V1_0 = typeof OuterKeyStorageV2_OuterVersion.V1_0;
  export type V2_0 = typeof OuterKeyStorageV2_OuterVersion.V2_0;
  export type UNRECOGNIZED = typeof OuterKeyStorageV2_OuterVersion.UNRECOGNIZED;
}

/** Argon2id parameters. */
export interface OuterKeyStorageV2_Argon2idParameters {
  version: OuterKeyStorageV2_Argon2idParameters_Argon2Version;
  /** Random salt (16 bytes) */
  salt: Uint8Array;
  /** Memory usage in bytes (≥ 128 MiB) */
  memoryBytes: number;
  /** Number of iterations (≥ 3) */
  iterations: number;
  /** Amount of parallelism (≥ 1, recommended to be 1) */
  parallelism: number;
}

/** Version of Argon2 */
export const OuterKeyStorageV2_Argon2idParameters_Argon2Version = { VERSION_1_3: 0, UNRECOGNIZED: -1 } as const;

export type OuterKeyStorageV2_Argon2idParameters_Argon2Version =
  typeof OuterKeyStorageV2_Argon2idParameters_Argon2Version[
    keyof typeof OuterKeyStorageV2_Argon2idParameters_Argon2Version
  ];

export namespace OuterKeyStorageV2_Argon2idParameters_Argon2Version {
  export type VERSION_1_3 = typeof OuterKeyStorageV2_Argon2idParameters_Argon2Version.VERSION_1_3;
  export type UNRECOGNIZED = typeof OuterKeyStorageV2_Argon2idParameters_Argon2Version.UNRECOGNIZED;
}

function createBaseDeviceIds(): DeviceIds {
  return { d2mDeviceId: Long.UZERO, cspDeviceId: Long.UZERO };
}

export const DeviceIds = {
  encode(message: DeviceIds, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (!message.d2mDeviceId.isZero()) {
      writer.uint32(8).uint64(message.d2mDeviceId);
    }
    if (!message.cspDeviceId.isZero()) {
      writer.uint32(16).uint64(message.cspDeviceId);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DeviceIds {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseDeviceIds();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.d2mDeviceId = reader.uint64() as Long;
          continue;
        case 2:
          if (tag !== 16) {
            break;
          }

          message.cspDeviceId = reader.uint64() as Long;
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseIdentityData(): IdentityData {
  return { identity: "", ck: new Uint8Array(0), serverGroup: "" };
}

export const IdentityData = {
  encode(message: IdentityData, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.identity !== "") {
      writer.uint32(10).string(message.identity);
    }
    if (message.ck.length !== 0) {
      writer.uint32(18).bytes(message.ck);
    }
    if (message.serverGroup !== "") {
      writer.uint32(34).string(message.serverGroup);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): IdentityData {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseIdentityData();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.identity = reader.string();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.ck = reader.bytes();
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.serverGroup = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseOnPremConfig(): OnPremConfig {
  return { oppfUrl: "", lastUpdated: Long.UZERO, oppfCachedConfig: "" };
}

export const OnPremConfig = {
  encode(message: OnPremConfig, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.oppfUrl !== "") {
      writer.uint32(10).string(message.oppfUrl);
    }
    if (!message.lastUpdated.isZero()) {
      writer.uint32(16).uint64(message.lastUpdated);
    }
    if (message.oppfCachedConfig !== "") {
      writer.uint32(26).string(message.oppfCachedConfig);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): OnPremConfig {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseOnPremConfig();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.oppfUrl = reader.string();
          continue;
        case 2:
          if (tag !== 16) {
            break;
          }

          message.lastUpdated = reader.uint64() as Long;
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.oppfCachedConfig = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseThreemaWorkCredentials(): ThreemaWorkCredentials {
  return { username: "", password: "" };
}

export const ThreemaWorkCredentials = {
  encode(message: ThreemaWorkCredentials, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.username !== "") {
      writer.uint32(10).string(message.username);
    }
    if (message.password !== "") {
      writer.uint32(18).string(message.password);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ThreemaWorkCredentials {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseThreemaWorkCredentials();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.username = reader.string();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.password = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseInnerKeyStorageV1(): InnerKeyStorageV1 {
  return {
    schemaVersion: 0,
    identityData: undefined,
    dgk: new Uint8Array(0),
    databaseKey: new Uint8Array(0),
    deviceIds: undefined,
    deviceCookie: undefined,
    workCredentials: undefined,
    onPremConfig: undefined,
  };
}

export const InnerKeyStorageV1 = {
  encode(message: InnerKeyStorageV1, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.schemaVersion !== 0) {
      writer.uint32(40).uint32(message.schemaVersion);
    }
    if (message.identityData !== undefined) {
      IdentityData.encode(message.identityData, writer.uint32(10).fork()).ldelim();
    }
    if (message.dgk.length !== 0) {
      writer.uint32(18).bytes(message.dgk);
    }
    if (message.databaseKey.length !== 0) {
      writer.uint32(26).bytes(message.databaseKey);
    }
    if (message.deviceIds !== undefined) {
      DeviceIds.encode(message.deviceIds, writer.uint32(34).fork()).ldelim();
    }
    if (message.deviceCookie !== undefined) {
      writer.uint32(66).bytes(message.deviceCookie);
    }
    if (message.workCredentials !== undefined) {
      ThreemaWorkCredentials.encode(message.workCredentials, writer.uint32(50).fork()).ldelim();
    }
    if (message.onPremConfig !== undefined) {
      OnPremConfig.encode(message.onPremConfig, writer.uint32(58).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): InnerKeyStorageV1 {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseInnerKeyStorageV1();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 5:
          if (tag !== 40) {
            break;
          }

          message.schemaVersion = reader.uint32();
          continue;
        case 1:
          if (tag !== 10) {
            break;
          }

          message.identityData = IdentityData.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.dgk = reader.bytes();
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.databaseKey = reader.bytes();
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.deviceIds = DeviceIds.decode(reader, reader.uint32());
          continue;
        case 8:
          if (tag !== 66) {
            break;
          }

          message.deviceCookie = reader.bytes();
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.workCredentials = ThreemaWorkCredentials.decode(reader, reader.uint32());
          continue;
        case 7:
          if (tag !== 58) {
            break;
          }

          message.onPremConfig = OnPremConfig.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseInnerKeyStorageV2(): InnerKeyStorageV2 {
  return {
    identityData: undefined,
    workCredentials: undefined,
    dgk: new Uint8Array(0),
    databaseKey: new Uint8Array(0),
    deviceIds: undefined,
    deviceCookie: new Uint8Array(0),
    onPremConfig: undefined,
  };
}

export const InnerKeyStorageV2 = {
  encode(message: InnerKeyStorageV2, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.identityData !== undefined) {
      IdentityData.encode(message.identityData, writer.uint32(10).fork()).ldelim();
    }
    if (message.workCredentials !== undefined) {
      ThreemaWorkCredentials.encode(message.workCredentials, writer.uint32(18).fork()).ldelim();
    }
    if (message.dgk.length !== 0) {
      writer.uint32(26).bytes(message.dgk);
    }
    if (message.databaseKey.length !== 0) {
      writer.uint32(34).bytes(message.databaseKey);
    }
    if (message.deviceIds !== undefined) {
      DeviceIds.encode(message.deviceIds, writer.uint32(42).fork()).ldelim();
    }
    if (message.deviceCookie.length !== 0) {
      writer.uint32(50).bytes(message.deviceCookie);
    }
    if (message.onPremConfig !== undefined) {
      OnPremConfig.encode(message.onPremConfig, writer.uint32(58).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): InnerKeyStorageV2 {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseInnerKeyStorageV2();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.identityData = IdentityData.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.workCredentials = ThreemaWorkCredentials.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.dgk = reader.bytes();
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.databaseKey = reader.bytes();
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.deviceIds = DeviceIds.decode(reader, reader.uint32());
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.deviceCookie = reader.bytes();
          continue;
        case 7:
          if (tag !== 58) {
            break;
          }

          message.onPremConfig = OnPremConfig.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseIntermediateKeyStorageV1(): IntermediateKeyStorageV1 {
  return { inner: undefined };
}

export const IntermediateKeyStorageV1 = {
  encode(message: IntermediateKeyStorageV1, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    switch (message.inner?.$case) {
      case "plaintextInner":
        writer.uint32(10).bytes(message.inner.plaintextInner);
        break;
      case "remoteSecretProtectedInner":
        IntermediateKeyStorageV1_RemoteSecretProtected.encode(
          message.inner.remoteSecretProtectedInner,
          writer.uint32(18).fork(),
        ).ldelim();
        break;
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): IntermediateKeyStorageV1 {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseIntermediateKeyStorageV1();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.inner = { $case: "plaintextInner", plaintextInner: reader.bytes() };
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.inner = {
            $case: "remoteSecretProtectedInner",
            remoteSecretProtectedInner: IntermediateKeyStorageV1_RemoteSecretProtected.decode(reader, reader.uint32()),
          };
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseIntermediateKeyStorageV1_RemoteSecretProtected(): IntermediateKeyStorageV1_RemoteSecretProtected {
  return {
    remoteSecretAuthenticationToken: new Uint8Array(0),
    remoteSecretHash: new Uint8Array(0),
    onPremCachedRemoteSecretEndpointUrl: "",
    encryptedInner: new Uint8Array(0),
  };
}

export const IntermediateKeyStorageV1_RemoteSecretProtected = {
  encode(
    message: IntermediateKeyStorageV1_RemoteSecretProtected,
    writer: _m0.Writer = _m0.Writer.create(),
  ): _m0.Writer {
    if (message.remoteSecretAuthenticationToken.length !== 0) {
      writer.uint32(10).bytes(message.remoteSecretAuthenticationToken);
    }
    if (message.remoteSecretHash.length !== 0) {
      writer.uint32(18).bytes(message.remoteSecretHash);
    }
    if (message.onPremCachedRemoteSecretEndpointUrl !== "") {
      writer.uint32(26).string(message.onPremCachedRemoteSecretEndpointUrl);
    }
    if (message.encryptedInner.length !== 0) {
      writer.uint32(34).bytes(message.encryptedInner);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): IntermediateKeyStorageV1_RemoteSecretProtected {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseIntermediateKeyStorageV1_RemoteSecretProtected();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.remoteSecretAuthenticationToken = reader.bytes();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.remoteSecretHash = reader.bytes();
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.onPremCachedRemoteSecretEndpointUrl = reader.string();
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.encryptedInner = reader.bytes();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseOuterKeyStorageV1(): OuterKeyStorageV1 {
  return { schemaVersion: 0, encryptedKeyStorage: new Uint8Array(0), kdfParameters: undefined };
}

export const OuterKeyStorageV1 = {
  encode(message: OuterKeyStorageV1, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.schemaVersion !== 0) {
      writer.uint32(24).uint32(message.schemaVersion);
    }
    if (message.encryptedKeyStorage.length !== 0) {
      writer.uint32(10).bytes(message.encryptedKeyStorage);
    }
    switch (message.kdfParameters?.$case) {
      case "argon2id":
        OuterKeyStorageV1_Argon2idParameters.encode(message.kdfParameters.argon2id, writer.uint32(18).fork()).ldelim();
        break;
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): OuterKeyStorageV1 {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseOuterKeyStorageV1();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 3:
          if (tag !== 24) {
            break;
          }

          message.schemaVersion = reader.uint32();
          continue;
        case 1:
          if (tag !== 10) {
            break;
          }

          message.encryptedKeyStorage = reader.bytes();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.kdfParameters = {
            $case: "argon2id",
            argon2id: OuterKeyStorageV1_Argon2idParameters.decode(reader, reader.uint32()),
          };
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseOuterKeyStorageV1_Argon2idParameters(): OuterKeyStorageV1_Argon2idParameters {
  return { version: 0, salt: new Uint8Array(0), memoryBytes: 0, iterations: 0, parallelism: 0 };
}

export const OuterKeyStorageV1_Argon2idParameters = {
  encode(message: OuterKeyStorageV1_Argon2idParameters, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.version !== 0) {
      writer.uint32(8).int32(message.version);
    }
    if (message.salt.length !== 0) {
      writer.uint32(18).bytes(message.salt);
    }
    if (message.memoryBytes !== 0) {
      writer.uint32(24).uint32(message.memoryBytes);
    }
    if (message.iterations !== 0) {
      writer.uint32(32).uint32(message.iterations);
    }
    if (message.parallelism !== 0) {
      writer.uint32(40).uint32(message.parallelism);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): OuterKeyStorageV1_Argon2idParameters {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseOuterKeyStorageV1_Argon2idParameters();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.version = reader.int32() as any;
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.salt = reader.bytes();
          continue;
        case 3:
          if (tag !== 24) {
            break;
          }

          message.memoryBytes = reader.uint32();
          continue;
        case 4:
          if (tag !== 32) {
            break;
          }

          message.iterations = reader.uint32();
          continue;
        case 5:
          if (tag !== 40) {
            break;
          }

          message.parallelism = reader.uint32();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseOuterKeyStorageV2(): OuterKeyStorageV2 {
  return { kdfParameters: undefined, encryptedIntermediate: new Uint8Array(0) };
}

export const OuterKeyStorageV2 = {
  encode(message: OuterKeyStorageV2, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    switch (message.kdfParameters?.$case) {
      case "argon2id":
        OuterKeyStorageV2_Argon2idParameters.encode(message.kdfParameters.argon2id, writer.uint32(18).fork()).ldelim();
        break;
    }
    if (message.encryptedIntermediate.length !== 0) {
      writer.uint32(10).bytes(message.encryptedIntermediate);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): OuterKeyStorageV2 {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseOuterKeyStorageV2();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 2:
          if (tag !== 18) {
            break;
          }

          message.kdfParameters = {
            $case: "argon2id",
            argon2id: OuterKeyStorageV2_Argon2idParameters.decode(reader, reader.uint32()),
          };
          continue;
        case 1:
          if (tag !== 10) {
            break;
          }

          message.encryptedIntermediate = reader.bytes();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

function createBaseOuterKeyStorageV2_Argon2idParameters(): OuterKeyStorageV2_Argon2idParameters {
  return { version: 0, salt: new Uint8Array(0), memoryBytes: 0, iterations: 0, parallelism: 0 };
}

export const OuterKeyStorageV2_Argon2idParameters = {
  encode(message: OuterKeyStorageV2_Argon2idParameters, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.version !== 0) {
      writer.uint32(8).int32(message.version);
    }
    if (message.salt.length !== 0) {
      writer.uint32(18).bytes(message.salt);
    }
    if (message.memoryBytes !== 0) {
      writer.uint32(24).uint32(message.memoryBytes);
    }
    if (message.iterations !== 0) {
      writer.uint32(32).uint32(message.iterations);
    }
    if (message.parallelism !== 0) {
      writer.uint32(40).uint32(message.parallelism);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): OuterKeyStorageV2_Argon2idParameters {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseOuterKeyStorageV2_Argon2idParameters();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.version = reader.int32() as any;
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.salt = reader.bytes();
          continue;
        case 3:
          if (tag !== 24) {
            break;
          }

          message.memoryBytes = reader.uint32();
          continue;
        case 4:
          if (tag !== 32) {
            break;
          }

          message.iterations = reader.uint32();
          continue;
        case 5:
          if (tag !== 40) {
            break;
          }

          message.parallelism = reader.uint32();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },
};

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}
