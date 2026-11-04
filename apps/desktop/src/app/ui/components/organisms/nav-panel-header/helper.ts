import ThreemaBlueDark from '@threema/branding/assets/logos/nav-panel-logo-blue-dark.svg';
import ThreemaBlueLight from '@threema/branding/assets/logos/nav-panel-logo-blue-light.svg';
import ThreemaGreenDark from '@threema/branding/assets/logos/nav-panel-logo-green-dark.svg';
import ThreemaGreenLight from '@threema/branding/assets/logos/nav-panel-logo-green-light.svg';
import ThreemaOnpremDark from '@threema/branding/assets/logos/nav-panel-logo-onprem-dark.svg';
import ThreemaOnpremLight from '@threema/branding/assets/logos/nav-panel-logo-onprem-light.svg';
import ThreemaPrivateDark from '@threema/branding/assets/logos/nav-panel-logo-private-dark.svg';
import ThreemaPrivateLight from '@threema/branding/assets/logos/nav-panel-logo-private-light.svg';
import ThreemaWorkDark from '@threema/branding/assets/logos/nav-panel-logo-work-dark.svg';
import ThreemaWorkLight from '@threema/branding/assets/logos/nav-panel-logo-work-light.svg';

import type {Theme} from '~/common/dom/ui/theme';

export function getFallbackLogoUrl(theme: Exclude<Theme, 'system'>): string {
    const flavor = import.meta.env.BUILD_FLAVOR;
    const logoMap: Record<typeof theme, Record<typeof flavor, string>> = {
        light: {
            'consumer-live': ThreemaPrivateLight,
            'consumer-sandbox': ThreemaGreenLight,
            'work-live': ThreemaWorkLight,
            'work-onprem': ThreemaOnpremLight,
            'work-sandbox': ThreemaBlueLight,
            'custom-onprem': ThreemaOnpremLight,
        },
        dark: {
            'consumer-live': ThreemaPrivateDark,
            'consumer-sandbox': ThreemaGreenDark,
            'work-live': ThreemaWorkDark,
            'work-onprem': ThreemaOnpremDark,
            'work-sandbox': ThreemaBlueDark,
            'custom-onprem': ThreemaOnpremDark,
        },
    };

    return logoMap[theme][flavor];
}
