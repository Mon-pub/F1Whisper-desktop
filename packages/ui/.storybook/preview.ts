import type {Preview} from '@storybook/svelte-vite';

// eslint-disable-next-line import/no-unassigned-import
import '../src/theme.css';

import BrandingDecorator from './BrandingDecorator.svelte';
import ThemeDecorator from './ThemeDecorator.svelte';

// Apply the default theme so the branding color tokens resolve correctly.
// Without this, components fall back to the neutral grey palette defined in theme.css.
document.documentElement.dataset.theme = 'consumer';

const preview: Preview = {
    decorators: [
        // eslint-disable-next-line @typescript-eslint/naming-convention
        (Story, context) => ({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Component: BrandingDecorator,
            props: {
                children: () => ({
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Component: Story,
                    props: context.args,
                }),
                context,
            },
        }),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        (Story, context) => ({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Component: ThemeDecorator,
            props: {
                children: () => ({
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Component: Story,
                    props: context.args,
                }),
                context,
            },
        }),
    ],
    globalTypes: {
        branding: {
            description: 'Global branding for components',
            defaultValue: 'consumer',
            toolbar: {
                title: 'Branding',
                icon: 'paintbrush',
                items: [
                    {value: 'consumer', title: 'Consumer'},
                    {value: 'onprem', title: 'OnPrem'},
                    {value: 'work', title: 'Work'},
                ],
                dynamicTitle: true,
            },
        },
        theme: {
            description: 'Global theme for the canvas',
            defaultValue: 'light',
            toolbar: {
                title: 'Theme',
                icon: 'circlehollow',
                items: [
                    {value: 'dark', icon: 'moon', title: 'Dark'},
                    {value: 'light', icon: 'sun', title: 'Light'},
                ],
                dynamicTitle: true,
            },
        },
    },
    initialGlobals: {
        branding: 'consumer',
        theme: 'light',
    },
    parameters: {
        backgrounds: {
            disable: true,
        },
        layout: 'centered',
    },
};

// eslint-disable-next-line import/no-default-export
export default preview;
