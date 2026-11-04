import type {Logger} from '~/common/logging';
import {getAndParseMdm} from '~/common/mdm';
import type {PrivacySettingsView, WorkSettingsView} from '~/common/model/types/settings';

interface ScreenshotPreventionState {
    /**
     * Determines if this setting is managed by MDM, can be changed by user or is unsupported on the platform
     */
    readonly mode: 'mdm' | 'unsupported' | 'changeable';

    /**
     * Determines if this setting is enabled or disabled, if platform is unsupported it will always be `false`
     */
    readonly enabled: boolean;
}

/**
 * Creates a derived state state for screenshot prevention from work and privacy settings ready for consumption
 */
export function createScreenshotPreventionState(
    workSettings: WorkSettingsView,
    privacySettings: PrivacySettingsView,
    log: Logger,
): ScreenshotPreventionState {
    const isUnsupported = import.meta.env.BUILD_PLATFORM === 'linux';

    if (isUnsupported) {
        return {
            mode: 'unsupported',
            enabled: false,
        };
    }

    const isDisabledByMdm = getAndParseMdm(
        workSettings.threemaMdmParameters,
        'th_disable_screenshots',
        log,
    );

    const isDisabledByLocalSettings = privacySettings.localScreenshotPrevention === true;

    return {
        mode: isDisabledByMdm !== undefined ? 'mdm' : 'changeable',
        enabled: isDisabledByMdm ?? isDisabledByLocalSettings,
    };
}
