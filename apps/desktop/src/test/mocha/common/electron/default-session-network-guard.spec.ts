import {expect} from 'chai';

import {
    DefaultSessionNetworkGuard,
    supportsFallbackOppfRecovery,
} from '~/electron/default-session-network-guard';

export function run(): void {
    describe('DefaultSessionNetworkGuard', function () {
        it('enables fallback recovery only for OnPrem builds', function () {
            expect(supportsFallbackOppfRecovery('onprem')).to.be.true;
            expect(supportsFallbackOppfRecovery('live')).to.be.false;
            expect(supportsFallbackOppfRecovery('sandbox')).to.be.false;
        });

        it('blocks OnPrem startup until pins are accepted', function () {
            const guard = new DefaultSessionNetworkGuard(true);
            const externalUrl = new URL('https://old.example/resource');

            expect(guard.shouldBlock(externalUrl)).to.be.true;
            expect(guard.beginPinUpdate()).to.be.true;
            guard.completePinUpdate();
            expect(guard.shouldBlock(externalUrl)).to.be.false;
        });

        it('keeps a recovery lock terminal despite later pin updates', function () {
            const guard = new DefaultSessionNetworkGuard(false);
            const externalUrl = new URL('https://old.example/resource');

            expect(guard.lockUntilRestart()).to.be.true;
            expect(guard.isLockedUntilRestart).to.be.true;
            expect(guard.lockUntilRestart()).to.be.false;
            expect(guard.beginPinUpdate()).to.be.false;
            guard.completePinUpdate();
            expect(guard.shouldBlock(externalUrl)).to.be.true;
        });

        it('allows only local and application requests while locked', function () {
            const guard = new DefaultSessionNetworkGuard(false);
            guard.lockUntilRestart();

            for (const url of [
                'devtools://devtools/bundled/inspector.html',
                'threemadesktop://app/',
                'http://localhost/resource',
                'http://127.0.0.1/resource',
                'http://[::1]/resource',
            ]) {
                expect(guard.shouldBlock(new URL(url)), url).to.be.false;
            }
            expect(guard.shouldBlock(new URL('https://old.example/resource'))).to.be.true;
        });
    });
}
