import type {LibthreemaTask} from '~/common/network/protocol/task/libthreema';

export class RsActivationTask implements LibthreemaTask<Promise<void>> {
    public constructor() {}
    public async run(): Promise<void> {}
}
