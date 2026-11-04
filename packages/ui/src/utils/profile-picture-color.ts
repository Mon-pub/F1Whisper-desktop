/**
 * Profile picture color names mapped to the Tailwind utility classes for the respective background
 * color. The set mirrors the stable color derived from a contact's identity. The concrete color
 * values live in the Tailwind theme (`--color-profile-*`, see `theme.css`).
 */
export const PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP = {
    'amber': 'bg-profile-amber/15',
    'blue': 'bg-profile-blue/15',
    'cyan': 'bg-profile-cyan/15',
    'deep-orange': 'bg-profile-deep-orange/15',
    'deep-purple': 'bg-profile-deep-purple/15',
    'green': 'bg-profile-green/15',
    'indigo': 'bg-profile-indigo/15',
    'light-blue': 'bg-profile-light-blue/15',
    'light-green': 'bg-profile-light-green/15',
    'olive': 'bg-profile-olive/15',
    'orange': 'bg-profile-orange/15',
    'pink': 'bg-profile-pink/15',
    'purple': 'bg-profile-purple/15',
    'red': 'bg-profile-red/15',
    'teal': 'bg-profile-teal/15',
    'yellow': 'bg-profile-yellow/15',
} as const;

/**
 * Profile picture color names mapped to the Tailwind utility classes for the respective text color.
 * The set mirrors the stable color derived from a contact's identity. The concrete color values
 * live in the Tailwind theme (`--color-profile-*`, see `theme.css`).
 */
export const PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP = {
    'amber': 'text-profile-amber',
    'blue': 'text-profile-blue',
    'cyan': 'text-profile-cyan',
    'deep-orange': 'text-profile-deep-orange',
    'deep-purple': 'text-profile-deep-purple',
    'green': 'text-profile-green',
    'indigo': 'text-profile-indigo',
    'light-blue': 'text-profile-light-blue',
    'light-green': 'text-profile-light-green',
    'olive': 'text-profile-olive',
    'orange': 'text-profile-orange',
    'pink': 'text-profile-pink',
    'purple': 'text-profile-purple',
    'red': 'text-profile-red',
    'teal': 'text-profile-teal',
    'yellow': 'text-profile-yellow',
} as const;

/**
 * Profile picture colors. The set mirrors the stable color derived from a contact's identity.
 */
export type ProfilePictureColor = keyof (
    | typeof PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP
    | typeof PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP
);
