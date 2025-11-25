import * as v from '@badrap/valita';

import {
    PollAnnounceType,
    PollAnnounceTypeUtils,
    PollAnswerType,
    PollAnswerTypeUtils,
    PollChoicesType,
    PollChoicesTypeUtils,
    PollDisplayMode,
    PollDisplayModeUtils,
    PollState,
    PollStateUtils,
} from '~/common/enum';
import * as csp from '~/common/network/structbuf/csp';
import {validator} from '~/common/network/structbuf/validate/utils';
import {ensureIdentityString, ensurePollId, type IdentityString} from '~/common/network/types';
import {ensureI53, ensureU53, type i53, type u53} from '~/common/types';
import {UTF8} from '~/common/utils/codec';
import {instanceOf} from '~/common/utils/valita-helpers';

/**
 * The raw poll choices JSON schema as defined by the protocol.
 */
export const RAW_POLL_CHOICE_JSON_SCHEMA = v
    .object({
        // Choice ID ('i'): A per-poll unique ID of the choice in form of an integer. Used when casting a vote.
        i: v.number().map(ensureI53),
        // Description ('n'): Choice description in form of a string
        n: v.string(),
        // Sort key ('o', DEPRECATED): Set this to the index of the choice object within the choices list.
        o: v.number().map(ensureU53),
        // Participant votes ('r'): A list of indices referring to the index of the participant (as
        // defined in the participants list) that cast a vote for this choice.
        r: v.array(v.number().map(ensureU53)).optional(),
        // Total amount of votes ('t'): The total amount of votes for this choice.
        t: v.number().map(ensureU53).optional(),
    })
    .rest(v.unknown());

/**
 * The raw poll JSON schema as defined by the protocol.
 */
export const RAW_POLL_JSON_SCHEMA = v
    .object({
        // Description ('d'): A short description/topic string for the poll.
        d: v.string(),
        // State ('s'):
        s: v.number().map((value) => PollStateUtils.fromNumber(value)),
        // Answer type ('a'):
        a: v.number().map((value) => PollAnswerTypeUtils.fromNumber(value)),
        // Announce type ('t'):
        t: v.number().map((value) => PollAnnounceTypeUtils.fromNumber(value)),
        // Display mode ('u'):
        u: v.number().map((value) => PollDisplayModeUtils.fromNumber(value)),
        // Choices type ('o', DEPRECATED): Always set this to the integer 0.
        o: v
            .number()
            .map((value) => PollChoicesTypeUtils.fromNumber(value))
            .optional(() => 0),
        // Participants ('p'): A list of Threema IDs that participated in the poll (i.e. they cast a vote).
        p: v.array(v.string().map(ensureIdentityString)).optional(),
        // Choices ('c'): A list of choice objects as defined below.
        c: v.array(RAW_POLL_CHOICE_JSON_SCHEMA),
    })
    .rest(v.unknown());

/**
 * A validated and structured representation of the raw poll choices JSON.
 */
export interface PollChoicesJson {
    readonly choiceId: i53;
    readonly description: string;
    readonly sortKey: u53;
    readonly participantVotes?: readonly u53[];
    readonly totalAmountVotes?: u53;
}

/**
 * A validated and structured representation of the raw poll JSON.
 */
export interface PollJson {
    readonly description: string;
    readonly pollState: PollState;
    readonly answerType: PollAnswerType;
    readonly announceType: PollAnnounceType;
    readonly displayMode: PollDisplayMode;
    readonly choicesType: PollChoicesType;
    readonly participants?: readonly IdentityString[];
    readonly choices: readonly PollChoicesJson[];
}

/**
 * Take a raw poll JSON (with single-letter keys) and convert it into a more structured
 * {@link PollJson} object.
 */
function processRawPollJson(json: v.Infer<typeof RAW_POLL_JSON_SCHEMA>): PollJson {
    return {
        description: json.d,
        pollState: json.s === 0 ? PollState.OPEN : PollState.CLOSED,
        answerType: json.a === 0 ? PollAnswerType.SINGLE_CHOICE : PollAnswerType.MULTIPLE_CHOICE,
        announceType: json.t === 0 ? PollAnnounceType.ON_CLOSE : PollAnnounceType.ON_EVERY_VOTE,
        displayMode: json.u === 0 ? PollDisplayMode.LIST : PollDisplayMode.SUMMARY,
        choicesType: PollChoicesType.TEXT,
        participants: json.p,
        choices: json.c.map((choice) => ({
            choiceId: choice.i,
            description: choice.n,
            sortKey: choice.o,
            participantVotes: choice.r,
            totalAmountVotes: choice.t,
        })),
    };
}

/** Validates {@link csp.e2e.PollSetup} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.PollSetup.prototype, {
            id: v.bigint().map(ensurePollId),
            poll: instanceOf<Uint8Array>(Uint8Array)
                .map((value) => UTF8.decode(value))
                .map<unknown>((value) => JSON.parse(value))
                .map((json) => RAW_POLL_JSON_SCHEMA.parse(json))
                .map(processRawPollJson),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.PollSetup} */
export type Type = v.Infer<typeof SCHEMA>;
