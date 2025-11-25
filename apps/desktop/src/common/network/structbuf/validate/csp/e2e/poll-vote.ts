import * as v from '@badrap/valita';

import * as csp from '~/common/network/structbuf/csp';
import {validator} from '~/common/network/structbuf/validate/utils';
import {ensureIdentityString, ensurePollId} from '~/common/network/types';
import {ensureI53} from '~/common/types';
import {UTF8} from '~/common/utils/codec';
import {instanceOf} from '~/common/utils/valita-helpers';

/**
 * The raw poll-vote choice schema as defined by the protocol.
 */
export const RAW_POLL_VOTE_CHOICES_JSON_SCHEMA = v.array(
    v.tuple([
        v.number().map(ensureI53),
        v
            .number()
            .assert<0 | 1>((value) => value === 0 || value === 1)
            .map((selected) => selected !== 0),
    ]),
);

/** Validates {@link csp.e2e.PollVote} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.PollVote.prototype, {
            pollId: v.bigint().map(ensurePollId),
            creatorIdentity: instanceOf<Uint8Array>(Uint8Array)
                .map((value) => UTF8.decode(value))
                .map(ensureIdentityString),
            choices: instanceOf<Uint8Array>(Uint8Array).map((value) =>
                RAW_POLL_VOTE_CHOICES_JSON_SCHEMA.parse(JSON.parse(UTF8.decode(value))),
            ),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.PollVote} */
export type Type = v.Infer<typeof SCHEMA>;
