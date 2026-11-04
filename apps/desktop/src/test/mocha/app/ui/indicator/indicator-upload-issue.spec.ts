import {expect} from 'chai';

import {getIndicatorElements} from '~/app/ui/components/molecules/message/internal/indicator/helpers';
import type {IndicatorProps} from '~/app/ui/components/molecules/message/internal/indicator/props';
import type {I18nType} from '~/app/ui/i18n-types';

/** A translator that returns the English default, tagged with the key it was asked for. */
const t = ((key: string, defaultValue?: string) =>
    `${key}|${defaultValue ?? ''}`) as unknown as I18nType['t'];

const CREATED = {created: {at: new Date(0)}};

function elementsFor(status: IndicatorProps['status']): ReturnType<typeof getIndicatorElements> {
    return getIndicatorElements('outbound', {}, status, t);
}

/**
 * The message indicator for an upload that is being retried or failed (F1Whisper fork).
 */
export function run(): void {
    describe('message indicator: upload issues', function () {
        it('shows a clock with the waiting hint while the upload is retried', function () {
            const [element] = elementsFor({...CREATED, uploadIssue: {kind: 'waiting'}});

            expect(element?.icon).to.equal('schedule');
            expect(element?.title).to.match(/^messaging\.hint--upload-waiting\|/u);
        });

        it('without an issue an unsent message keeps the plain upload icon', function () {
            const [element] = elementsFor(CREATED);

            expect(element?.icon).to.equal('file_upload');
            expect(element?.title).to.equal(undefined);
        });

        const REASONS = [
            ['too-slow', 'messaging.error--upload-too-slow'],
            ['too-large', 'messaging.error--send-file-file-too-large'],
            ['storage-full', 'messaging.error--upload-storage-full'],
            ['failed', 'messaging.error--upload-failed'],
        ] as const;
        for (const [reason, key] of REASONS) {
            it(`a failed upload (${reason}) shows the red indicator titled ${key}`, function () {
                const [element] = elementsFor({
                    ...CREATED,
                    error: {at: new Date(1)},
                    uploadIssue: {kind: 'failed', reason},
                });

                expect(element?.icon).to.equal('report_problem');
                expect(element?.color).to.equal('error');
                expect(element?.title?.startsWith(`${key}|`)).to.equal(true);
            });
        }

        it('after a restart the reason is gone: still the red indicator, without a title', function () {
            const [element] = elementsFor({...CREATED, error: {at: new Date(1)}});

            expect(element?.icon).to.equal('report_problem');
            expect(element?.title).to.equal(undefined);
        });

        it('a sent message ignores a stale waiting hint', function () {
            const [element] = elementsFor({
                ...CREATED,
                sent: {at: new Date(1)},
                uploadIssue: {kind: 'waiting'},
            });

            expect(element?.icon).to.equal('email');
        });

        it('inbound messages and deleted messages show nothing', function () {
            expect(
                getIndicatorElements(
                    'inbound',
                    {},
                    {...CREATED, uploadIssue: {kind: 'waiting'}},
                    t,
                ),
            ).to.deep.equal([]);
            expect(
                elementsFor({
                    ...CREATED,
                    deleted: {at: new Date(1)},
                    uploadIssue: {kind: 'waiting'},
                }),
            ).to.deep.equal([]);
        });
    });
}
