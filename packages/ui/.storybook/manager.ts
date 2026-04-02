import {addons} from 'storybook/manager-api';
import {create} from 'storybook/theming';

const theme = create({
    base: 'light',
    brandTitle: 'Threema UI',
    brandUrl: 'https://threema.com',
    brandImage: 'https://threema.com/assets/company/logo/dark/threema_logo_bw.svg',
    brandTarget: '_self',
});

addons.setConfig({
    theme,
});
