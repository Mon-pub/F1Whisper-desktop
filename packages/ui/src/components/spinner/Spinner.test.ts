import {assert, describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-svelte';

import Spinner from './Spinner.svelte';

describe('Spinner.svelte', () => {
    it('forwards extra props to the underlying element', async () => {
        // Arrange
        const {getByTestId} = render(Spinner, {'data-testid': 'spinner'});

        // Assert: If an element with the given `data-testid` attribute is in the document, it means
        // that the prop was correctly forwarded to the element.
        await expect.element(getByTestId('spinner')).toBeInTheDocument();
    });

    it('inherits the stroke color from its parent', () => {
        // Arrange: Render the spinner inside a parent container.
        const {container, getByTestId} = render(Spinner, {'data-testid': 'spinner'});
        const spinner = getByTestId('spinner');
        const circle = spinner.element().querySelector('circle');
        assert(circle !== null);

        // Act: Set parent `color`.
        container.style.color = 'rgb(255, 0, 0)';

        // Assert: The circle's computed stroke color must equal the container's content `color`.
        expect(getComputedStyle(circle).stroke).toBe('rgb(255, 0, 0)');
    });

    it('fills the space made available to it by its parent by default', () => {
        // Arrange: Render the spinner inside a parent container.
        const {container, getByTestId} = render(Spinner, {'data-testid': 'spinner'});
        const spinner = getByTestId('spinner');

        // Act: Set container dimensions.
        container.style.width = '64px';
        container.style.height = '64px';

        // Assert
        const rect = spinner.element().getBoundingClientRect();
        expect(rect.width).toBe(64);
        expect(rect.height).toBe(64);
    });

    it('can be sized arbitrarily via the class prop', () => {
        // Arrange: Render the spinner inside a parent container.
        const {container, getByTestId} = render(Spinner, {
            'class': 'size-6',
            'data-testid': 'spinner',
        });
        const spinner = getByTestId('spinner');

        // Act: Set container to a larger size than the spinner.
        container.style.width = '64px';
        container.style.height = '64px';

        // Assert: `size-6` (24px at the default 16px root font size).
        const rect = spinner.element().getBoundingClientRect();
        expect(rect.width).toBe(24);
        expect(rect.height).toBe(24);
    });
});
