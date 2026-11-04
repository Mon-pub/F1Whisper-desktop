import {group_call} from '@threema/protocol/protobuf';
import {expect} from 'chai';

import * as utils from '~/common/network/protobuf/utils';
import {type S2pHello, S2P_ENVELOPE_SCHEMA} from '~/common/network/protobuf/validate/group-call';
import {ensureParticipantId} from '~/common/network/protocol/call/group-call';
import {unwrap} from '~/common/utils/assert';

export function run(): void {
    describe('validate group_call.SfuToParticipant.Envelope', function () {
        function parseHello(participantIds: readonly number[]): S2pHello {
            const encoded = group_call.SfuToParticipant.Envelope.encode(
                utils.creator(group_call.SfuToParticipant.Envelope, {
                    padding: new Uint8Array(0),
                    hello: utils.creator(group_call.SfuToParticipant.Hello, {
                        participantIds,
                    }),
                    relay: undefined,
                    timestampResponse: undefined,
                    participantJoined: undefined,
                    participantLeft: undefined,
                }),
            ).finish();
            const envelope = S2P_ENVELOPE_SCHEMA.parse(
                group_call.SfuToParticipant.Envelope.decode(encoded),
            );
            expect(envelope.content).to.equal('hello');
            return unwrap(envelope.hello);
        }

        // Regression test: When creating a group call, the SFU's 'hello' contains no other
        // participants, so the (packed, repeated) field is absent on the wire. Parsing must not
        // fail in that case.
        it("accepts an SFU 'hello' without any participants", function () {
            const hello = parseHello([]);
            expect(hello.participantIds).to.eql([]);
        });

        it("accepts an SFU 'hello' with existing participants", function () {
            const hello = parseHello([1, 2, 42]);
            expect(hello.participantIds).to.eql([1, 2, 42].map((id) => ensureParticipantId(id)));
        });
    });
}
