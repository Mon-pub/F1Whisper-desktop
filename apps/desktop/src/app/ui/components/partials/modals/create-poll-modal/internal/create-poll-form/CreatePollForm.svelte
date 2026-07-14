<!--
  @component Renders a modal with details about a message.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import ChecklistItemsEditor from '~/app/ui/components/partials/modals/create-poll-modal/internal/checklist-items-editor/ChecklistItemsEditor.svelte';
  import type {CreatePollFormProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/create-poll-form/props';
  import HiddenSubmit from '~/app/ui/generic/form/HiddenSubmit.svelte';
  import {i18n} from '~/app/ui/i18n';
  import Input from '~/app/ui/svelte-components/blocks/Input/Text.svelte';
  import {MAX_POLL_DESCRIPTION_SIZE_BYTES, MAX_POLL_SIZE_BYTES} from '~/app/ui/utils/constants';
  import {PollAnnounceType, PollAnswerType, PollDisplayMode, PollState} from '~/common/enum';
  import {UTF8} from '~/common/utils/codec';
  import {TIMER} from '~/common/utils/timer';

  let {
    choices = $bindable(),
    isFormValid = $bindable(false),
    onclickcopypoll,
    onsend,
    options = $bindable(),
    pollTitle,
  }: CreatePollFormProps = $props();

  let maxSizeExceeded = $state(false);

  /**
   * Validate and submit the form.
   */
  export function submit(): void {
    handleSubmit(undefined);
  }

  function handleSubmit(event: Event | undefined): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (!getIsValid(pollTitle, choices)) {
      return;
    }

    const asChecklist = options.asChecklist === true;

    // This is a heuristic. The sent poll will probably be slightly shorter than this because of the
    // shorter names.
    const pollMessageData = {
      // A checklist behaves like a multi-select poll with always-visible state: each participant
      // can independently check items and everyone sees the result immediately.
      announceType:
        asChecklist || options.showIntermediateResults
          ? PollAnnounceType.ON_EVERY_VOTE
          : PollAnnounceType.ON_CLOSE,
      answerType:
        asChecklist || options.allowMultipleAnswers
          ? PollAnswerType.MULTIPLE_CHOICE
          : PollAnswerType.SINGLE_CHOICE,
      choices: choices
        // Filter out all empty choices.
        .filter((choice) => choice.description.trim() !== '')
        .map((choice, index) => ({
          // Android cannot handle a choiceId of 0 at the moment. Therefore, we start with 1.
          choiceId: index + 1,
          description: choice.description,
        })),
      description: pollTitle,
      displayMode: asChecklist ? PollDisplayMode.CHECKLIST : PollDisplayMode.LIST,
      pollState: PollState.OPEN,
      type: 'poll',
    } as const;

    updateMaxSizeExceeded();
    if (
      maxSizeExceeded ||
      UTF8.encode(JSON.stringify(pollMessageData)).byteLength > MAX_POLL_SIZE_BYTES
    ) {
      return;
    }

    onsend(pollMessageData);
  }

  // A checklist may shrink to a single item; a regular poll keeps the 2-option floor.
  const minChoices = $derived(options.asChecklist === true ? 1 : 2);

  function updateMaxSizeExceeded(): void {
    maxSizeExceeded =
      UTF8.encode(pollTitle).byteLength > MAX_POLL_DESCRIPTION_SIZE_BYTES ||
      choices
        .map((choice) => UTF8.encode(choice.description).byteLength)
        .some((byteLength) => byteLength > MAX_POLL_DESCRIPTION_SIZE_BYTES);
  }

  function getIsValid(currentPollTitle: typeof pollTitle, currentChoices: typeof choices): boolean {
    return (
      currentPollTitle.trim() !== '' &&
      currentChoices.filter((choice) => choice.description.trim() !== '').length > 1
    );
  }

  const formEdited = $derived(
    pollTitle.trim() !== '' ||
      choices.find((choice) => choice.description.trim() !== '') !== undefined,
  );

  const handleMutation = TIMER.debounce(() => updateMaxSizeExceeded(), 2000, true);

  $effect(() => {
    isFormValid = getIsValid(pollTitle, choices) && !maxSizeExceeded;
  });
</script>

<KeyValueList.ItemWithButton
  icon="keyboard_arrow_right"
  key={$i18n.t('dialog--create-poll-message.label--copy-existing', 'Copy existing poll')}
  options={{disabled: formEdited}}
  onclick={onclickcopypoll}
  ><Text
    text={$i18n.t(
      'dialog--create-poll-message.prose--copy-existing-condition',
      'Only available if the fields below are still empty',
    )}
    color={formEdited ? 'mono-disabled' : 'inherit'}
  ></Text>
</KeyValueList.ItemWithButton>
<form
  class="form"
  onsubmit={(event) => {
    event.preventDefault();
    handleSubmit(event);
  }}
  oninput={handleMutation}
>
  <HiddenSubmit />
  <Input
    bind:value={pollTitle}
    label={$i18n.t('dialog--create-poll-message.label--poll-title', 'Title')}
    spellcheck={false}
  />
  <ChecklistItemsEditor
    bind:items={choices}
    minItems={minChoices}
    headerLabel={$i18n.t('dialog--create-poll-message.label--options-title', 'Options')}
    itemLabel={$i18n.t('dialog--create-poll-message.label--add-choice', 'Add Choice')}
    onmutate={handleMutation}
  />
</form>
<KeyValueList.ItemWithSwitch bind:checked={options.asChecklist} key=""
  ><Text
    text={$i18n.t(
      'dialog--create-poll-message.label--as-checklist',
      'Create as checklist (tap items to check them off)',
    )}
  ></Text>
</KeyValueList.ItemWithSwitch>
<KeyValueList.ItemWithSwitch
  bind:checked={options.allowMultipleAnswers}
  key=""
  disabled={options.asChecklist === true}
  ><Text
    text={$i18n.t('dialog--create-poll-message.label--multiple-answers', 'Allow multiple answers')}
  ></Text>
</KeyValueList.ItemWithSwitch>
<KeyValueList.ItemWithSwitch
  bind:checked={options.showIntermediateResults}
  key=""
  disabled={options.asChecklist === true}
  ><Text
    text={$i18n.t(
      'dialog--create-poll-message.label--intermediate-results',
      'Show intermediate results',
    )}
  ></Text>
</KeyValueList.ItemWithSwitch>

<style lang="scss">
  @use 'component' as *;

  .form {
    margin: rem(12px) rem(16px) rem(16px) rem(16px);
    padding: rem(24px) 0 0 0;

    border-top: rem(1px) solid var(--ic-divider-background-color);
  }
</style>
