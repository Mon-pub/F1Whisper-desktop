import * as v from '@badrap/valita';
import Long from 'long';

import type {Logger} from '~/common/logging';
import type {u64} from '~/common/types';
import {assert} from '~/common/utils/assert';

const SCHEMA_BIGINT = v.object({
    $case: v.literal('integerValue'),
    integerValue: v.unknown().chain((value: unknown) => {
        if (Long.isLong(value)) {
            // When Protobuf falls back to the default value of 0, this is a signed `Long`
            // value. Convert to unsigned.
            if (value.isZero()) {
                return v.ok(Long.UZERO);
            }

            return v.ok(value);
        }
        return v.err(
            `Expected a Long value, but "Long.isLong" returns false for value "${value}" with type "${typeof value}"`,
        );
    }),
});

const SCHEMA_BOOL = v.object({
    $case: v.literal('booleanValue'),
    booleanValue: v.boolean(),
});

const SCHEMA_STRING = v.object({
    $case: v.literal('stringValue'),
    stringValue: v.string(),
});

export const MDM_VALUE_SCHEMA = v.union(SCHEMA_BIGINT, SCHEMA_BOOL, SCHEMA_STRING);

export type MdmSchemaType = v.Infer<typeof MDM_VALUE_SCHEMA>;

export type MdmAcceptedParamters = string | u64 | boolean;
type MdmAcceptedParamterLiterals = 'string' | 'bigint' | 'boolean';

/* eslint-disable @typescript-eslint/naming-convention */

const SUPPORTED_MDM_PARAMETER_TYPE_MAP = {
    th_enforce_remote_secret: 'boolean',
} as const;

/* eslint-enable @typescript-eslint/naming-convention */

type ParseReturnTypeOf<T extends MdmAcceptedParamterLiterals> = T extends 'string'
    ? string
    : T extends 'bigint'
      ? u64
      : T extends 'boolean'
        ? boolean
        : never;

export function getAndParseMdm<TKeyName extends keyof typeof SUPPORTED_MDM_PARAMETER_TYPE_MAP>(
    mdmParameterMap: ReadonlyMap<string, MdmAcceptedParamters>,
    name: TKeyName,
    log: Logger,
): ParseReturnTypeOf<(typeof SUPPORTED_MDM_PARAMETER_TYPE_MAP)[TKeyName]> | undefined {
    const parameterValue = mdmParameterMap.get(name);
    if (parameterValue === undefined) {
        return undefined;
    }
    if (typeof parameterValue !== SUPPORTED_MDM_PARAMETER_TYPE_MAP[name]) {
        log.error(
            `The type of the mdm parameter ${name}: ${typeof parameterValue} does not match the specified type ${SUPPORTED_MDM_PARAMETER_TYPE_MAP[name]}`,
        );
        return undefined;
    }

    const type = SUPPORTED_MDM_PARAMETER_TYPE_MAP[name];

    switch (type) {
        // There will be more types in the future
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        case 'boolean':
            assert(
                typeof parameterValue === 'boolean',
                `Mdm parameter must be to the correct type boolean, but is ${typeof parameterValue}`,
            );
            return parameterValue as ParseReturnTypeOf<typeof type>;
        default:
            log.error('Failed to match mdm parameter type');
            return undefined;
    }
}
