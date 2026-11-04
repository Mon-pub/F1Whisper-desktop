<script lang="ts">
  import {globals} from '~/app/globals';
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import AvailabilityStatusCategory from '~/app/ui/components/partials/modals/set-availability-status-modal/internal/AvailabilityStatusCategory.svelte';
  import type {SetAvailabilityStatusModalProps} from '~/app/ui/components/partials/modals/set-availability-status-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {WorkAvailabilityStatusCategory} from '~/common/enum';
  import {getUtf8ByteLength} from '~/common/utils/string';

  const DESCRIPTION_BYTES_LIMIT = 256;

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.set-availability-status-modal');

  const {onclose, onsubmit, workAvailabilityStatus}: SetAvailabilityStatusModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);
  let currentCategory: WorkAvailabilityStatusCategory = $state(workAvailabilityStatus.category);
  let currentDescription = $state<string>(workAvailabilityStatus.description ?? '');

  const hasError = $derived(!getIsValid(currentDescription, currentCategory));

  function getIsValid(description: string, category: WorkAvailabilityStatusCategory): boolean {
    const isDescriptionTooLong = getUtf8ByteLength(description) > DESCRIPTION_BYTES_LIMIT;

    return !isDescriptionTooLong || category === WorkAvailabilityStatusCategory.NONE;
  }

  async function handleSubmit(): Promise<void> {
    if (!getIsValid(currentDescription, currentCategory)) {
      return;
    }

    await onsubmit({
      category: currentCategory,
      description:
        currentCategory === WorkAvailabilityStatusCategory.NONE ? '' : currentDescription,
    })
      .catch((error) => {
        log.error(`Error updating availability status: ${error}`);
        toast.addSimpleFailure(
          $i18n.t(
            'dialog--set-availability-status.error--set-status',
            'Failed to set the availability status',
          ),
        );
      })
      .finally(() => {
        modalComponent?.close();
      });
  }

  function handleClickCategory(category: WorkAvailabilityStatusCategory): void {
    currentCategory = category;
  }
</script>

<Modal
  bind:this={modalComponent}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    buttons: [
      {
        label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
        type: 'naked',
        onclick: 'close',
      },
      {
        label: $i18n.t('dialog--common.action--save', 'Save'),
        onclick: 'submit',
        type: 'filled',
        disabled: hasError,
      },
    ],
    title: $i18n.t('dialog--set-availability-status.label--title', 'Set Status'),
    maxWidth: 460,
  }}
  options={{
    allowSubmittingWithEnter: true,
  }}
  onsubmit={handleSubmit}
  {onclose}
>
  <div class="content">
    <Text
      text={$i18n.t(
        'dialog--set-availability-status.prose--hint-status',
        'This status is visible to everyone in your company.',
      )}
    ></Text>

    <div class="options">
      <AvailabilityStatusCategory
        selected={currentCategory === WorkAvailabilityStatusCategory.NONE}
        category={WorkAvailabilityStatusCategory.NONE}
        onclick={handleClickCategory}
      ></AvailabilityStatusCategory>
      <AvailabilityStatusCategory
        selected={currentCategory === WorkAvailabilityStatusCategory.BUSY}
        category={WorkAvailabilityStatusCategory.BUSY}
        onclick={handleClickCategory}
      ></AvailabilityStatusCategory>
      <AvailabilityStatusCategory
        selected={currentCategory === WorkAvailabilityStatusCategory.UNAVAILABLE}
        category={WorkAvailabilityStatusCategory.UNAVAILABLE}
        onclick={handleClickCategory}
      ></AvailabilityStatusCategory>
    </div>

    {#if currentCategory !== WorkAvailabilityStatusCategory.NONE}
      <Text
        text={$i18n.t(
          'dialog--set-availability-status.label--custom-text',
          'Custom Text (Optional)',
        )}
      ></Text>

      <div>
        <Input
          id="availability-status-description"
          bind:value={currentDescription}
          error={hasError
            ? $i18n.t(
                'dialog--set-availability-status.prose--error-custom-text',
                'Text is too long, please shorten it.',
              )
            : undefined}
        />
      </div>

      <Text
        text={$i18n.t(
          'dialog--set-availability-status.prose--hint-custom-text',
          'Set a custom status message when Busy or Unavailable is selected.',
        )}
      ></Text>
    {/if}
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    gap: rem(16px);

    padding: 0 rem(16px);

    .options {
      display: flex;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;
      gap: rem(4px);
    }
  }
</style>
