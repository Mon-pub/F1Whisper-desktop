import {describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import {render} from 'vitest-browser-svelte';

import AvatarSelectionSummary, {
    type AvatarSelectionSummaryItem,
} from './AvatarSelectionSummary.svelte';

/**
 * Create an item with the given `label`, along with the `onclick` mock its remove action was
 * created with. Note: The item is removable unless `options.removable` is `false`, in which case it
 * does not provide any actions.
 */
function createItem(
    label: string,
    options: {readonly removable?: boolean} = {},
): {
    readonly item: AvatarSelectionSummaryItem;
    readonly onclick: ReturnType<typeof vi.fn>;
} {
    const {removable = true} = options;
    const onclick = vi.fn();

    return {
        item: {
            actions: removable ? {remove: {label: `Remove ${label}`, onclick}} : undefined,
            description: `Profile picture of ${label}`,
            id: label,
            initials: label.slice(0, 2),
            label,
        },
        onclick,
    };
}

describe('AvatarSelectionSummary.svelte', () => {
    it('forwards extra props to the underlying element', () => {
        // Arrange
        const {container} = render(AvatarSelectionSummary, {
            'items': [createItem('Jane Doe').item],
            'data-testid': 'summary',
        });

        // Assert
        expect(container.querySelector('[data-testid="summary"]')).not.toBeNull();
    });

    it('renders one list item per item', async () => {
        // Arrange
        const items = [createItem('Jane Doe').item, createItem('John Doe').item];

        // Act
        render(AvatarSelectionSummary, {items});

        // Assert
        await expect.element(page.getByRole('listitem').first()).toBeInTheDocument();
        expect(page.getByRole('listitem').elements()).toHaveLength(2);
        await expect.element(page.getByText('Jane Doe')).toBeInTheDocument();
        await expect.element(page.getByText('John Doe')).toBeInTheDocument();
    });

    it('renders the initials of an item without a profile picture', async () => {
        // Act
        render(AvatarSelectionSummary, {items: [createItem('Jane Doe').item]});

        // Assert: An exact match, as the label below the avatar starts with the initials.
        await expect.element(page.getByText('Ja', {exact: true})).toBeInTheDocument();
    });

    it('displays the heading if one is given', async () => {
        // Act
        render(AvatarSelectionSummary, {
            heading: '1 of 256 members',
            items: [createItem('Jane Doe').item],
        });

        // Assert
        await expect.element(page.getByText('1 of 256 members')).toBeInTheDocument();
    });

    it('names the remove button of an item by the label of the action', async () => {
        // Act
        render(AvatarSelectionSummary, {items: [createItem('Jane Doe').item]});

        // Assert
        await expect
            .element(page.getByRole('button', {name: 'Remove Jane Doe'}))
            .toBeInTheDocument();
    });

    it('does not render a remove button for an item without the respective action', async () => {
        // Act
        render(AvatarSelectionSummary, {
            items: [createItem('Jane Doe', {removable: false}).item],
        });

        // Assert
        await expect.element(page.getByRole('listitem')).toBeInTheDocument();
        expect(page.getByRole('button').elements()).toHaveLength(0);
    });

    it('calls the remove action of the respective item when its button is clicked', async () => {
        // Arrange
        const jane = createItem('Jane Doe');
        const john = createItem('John Doe');

        // Act
        render(AvatarSelectionSummary, {items: [jane.item, john.item]});
        await page.getByRole('button', {name: 'Remove John Doe'}).click();

        // Assert
        expect(john.onclick).toHaveBeenCalledTimes(1);
        expect(jane.onclick).not.toHaveBeenCalled();
    });
});
