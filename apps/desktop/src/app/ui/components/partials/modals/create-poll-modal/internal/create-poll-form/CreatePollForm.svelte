<!--
  @component Renders a modal with details about a message.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import type {CreatePollFormProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/create-poll-form/props';
  import HiddenSubmit from '~/app/ui/generic/form/HiddenSubmit.svelte';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import Input from '~/app/ui/svelte-components/blocks/Input/Text.svelte';
  import {MAX_POLL_DESCRIPTION_SIZE_BYTES, MAX_POLL_SIZE_BYTES} from '~/app/ui/utils/constants';
  import {PollAnnounceType, PollAnswerType, PollDisplayMode, PollState} from '~/common/enum';
  import type {u53} from '~/common/types';
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

    // This is a heuristic. The sent poll will probably be slightly shorter than this because of the
    // shorter names.
    const pollMessageData = {
      announceType: options.showIntermediateResults
        ? PollAnnounceType.ON_EVERY_VOTE
        : PollAnnounceType.ON_CLOSE,
      answerType: options.allowMultipleAnswers
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
      displayMode: PollDisplayMode.LIST,
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

  function onClickAddOption(): void {
    const currentMaxId = Math.max(...choices.map((choice) => choice.id));
    choices.push({description: '', id: currentMaxId + 1});
  }

  function onClickRemoveChoice(id: u53): void {
    if (choices.length < 3) {
      return;
    }
    choices = choices.filter((choice) => choice.id !== id);
    handleMutation();
  }

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
  <div class="options">
    <div class="header">
      <Text
        text={$i18n.t('dialog--create-poll-message.label--options-title', 'Options')}
        size="body-large"
      />
      <IconButton flavor="naked" onclick={onClickAddOption}
        ><MdIcon theme="Outlined">add_circle</MdIcon>
      </IconButton>
    </div>
    {#each choices as choice (choice.id)}
      <div class="choice">
        <div class="input">
          <Input
            bind:value={choice.description}
            label={$i18n.t('dialog--create-poll-message.label--add-choice', 'Add Choice')}
            spellcheck={false}
          />
        </div>
        <div class="delete">
          <IconButton
            flavor="naked"
            disabled={choices.length < 3}
            onclick={() => onClickRemoveChoice(choice.id)}
            ><MdIcon theme="Outlined">delete</MdIcon>
          </IconButton>
        </div>
      </div>
    {/each}
  </div>
</form>
<KeyValueList.ItemWithSwitch bind:checked={options.allowMultipleAnswers} key=""
  ><Text
    text={$i18n.t('dialog--create-poll-message.label--multiple-answers', 'Allow multiple answers')}
  ></Text>
</KeyValueList.ItemWithSwitch>
<KeyValueList.ItemWithSwitch bind:checked={options.showIntermediateResults} key=""
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

    .options {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;

      padding: rem(16px) 0 0 0;

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        margin-bottom: rem(8px);
      }

      .choice {
        display: flex;
        align-items: center;
        justify-content: stretch;

        gap: rem(8px);

        .input {
          flex: 1 1 auto;
        }

        .delete {
          flex: 0 0 auto;
        }
      }
    }
  }
</style>
