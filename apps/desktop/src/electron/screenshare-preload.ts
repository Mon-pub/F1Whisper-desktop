// eslint-disable-next-line import/no-extraneous-dependencies
import {contextBridge, ipcRenderer} from 'electron';

import type {ScreenSharingReminderDetails, ScreenSharingReminderIpc} from '~/common/electron-ipc';
import {ScreenSharingReminderIpcCommand} from '~/common/enum';
import {CONSOLE_LOGGER} from '~/common/logging';

const log = CONSOLE_LOGGER;

log.debug('Loaded screen share preload script');

const screenshareApi: ScreenSharingReminderIpc = {
    hideScreenSharingReminder: () =>
        ipcRenderer.send(ScreenSharingReminderIpcCommand.HIDE_SCREEN_SHARING_REMINDER),
    stopScreenSharing: () => ipcRenderer.send(ScreenSharingReminderIpcCommand.STOP_SCREEN_SHARING),

    onDetails: (callback) =>
        ipcRenderer.on(
            ScreenSharingReminderIpcCommand.SET_DETAILS,
            (event, details: ScreenSharingReminderDetails) => callback(details),
        ),
};

contextBridge.exposeInMainWorld('screenshare', screenshareApi);
