<!--
  @component Renders a modal that lets the user switch to another session profile (or create a new
  one) and restart the app into it.
-->
<script lang="ts">
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {SwitchProfileModalProps} from '~/app/ui/components/partials/settings/internal/profile-settings/internal/switch-profile-modal/props';
  import {i18n} from '~/app/ui/i18n';

  const {onclose, services}: SwitchProfileModalProps = $props();

  // The list of existing profiles is read once when the modal is opened (it does not change while
  // the modal is visible).
  const profiles = services.electron.listProfiles();
  const existingNames = new Set(profiles.map((profile) => profile.name));

  // Profile name validation. Must match the `profile` run-parameter schema on the main process.
  const PROFILE_NAME_PATTERN = /^[0-9a-z]+$/u;

  let selectedExisting = $state<string | undefined>(undefined);
  let newProfileName = $state('');

  const trimmedNewName = $derived(newProfileName.trim());

  // Validation error for the "create new profile" input. Returns `undefined` when the field is empty
  // or valid.
  const newNameError = $derived.by(() => {
    if (trimmedNewName === '') {
      return undefined;
    }
    if (trimmedNewName.match(PROFILE_NAME_PATTERN) === null) {
      return $i18n.t(
        'dialog--switch-profile.error--invalid-name',
        'Use only lowercase letters (a-z) and numbers.',
      );
    }
    if (existingNames.has(trimmedNewName)) {
      return $i18n.t(
        'dialog--switch-profile.error--already-exists',
        'A profile with this name already exists.',
      );
    }
    return undefined;
  });

  // The profile to switch to: a valid new name takes precedence, otherwise the selected existing
  // profile. `undefined` disables the confirm button.
  const targetProfile = $derived.by(() => {
    if (trimmedNewName !== '') {
      return newNameError === undefined ? trimmedNewName : undefined;
    }
    return selectedExisting;
  });

  function handleSelectExisting(name: string): void {
    newProfileName = '';
    selectedExisting = name;
  }

  function handleInput(): void {
    // Typing a new name clears any previously selected existing profile.
    selectedExisting = undefined;
  }

  function handleSwitch(): void {
    const target = targetProfile;
    if (target === undefined) {
      return;
    }
    // This exits and relaunches the app into the target profile; the modal will be torn down with
    // the current process.
    services.electron.switchProfileAndRestart(target);
  }
</script>

<Modal
  {onclose}
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
        label: $i18n.t('dialog--switch-profile.action--switch-and-restart', 'Switch and Restart'),
        type: 'filled',
        disabled: targetProfile === undefined,
        onclick: handleSwitch,
      },
    ],
    title: $i18n.t('dialog--switch-profile.label--title', 'Switch Profile'),
    minWidth: 320,
    maxWidth: 520,
  }}
>
  <div class="content">
    <div class="description">
      <Text
        text={$i18n.t(
          'dialog--switch-profile.prose--description',
          'Each profile keeps its own {shortAppName} ID and data on this device. Switch to another profile or create a new one; the app will restart.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      />
    </div>

    <div class="section">
      <div class="section-label">
        <Text
          color="mono-low"
          size="body-small"
          text={$i18n.t('dialog--switch-profile.label--existing-profiles', 'Existing Profiles')}
        />
      </div>
      <ul class="profiles">
        {#each profiles as profile (profile.name)}
          <li>
            <button
              type="button"
              class="profile"
              class:selected={selectedExisting === profile.name}
              disabled={profile.isCurrent}
              onclick={() => handleSelectExisting(profile.name)}
            >
              <span class="name">
                <Text
                  text={profile.name === 'default'
                    ? $i18n.t('dialog--switch-profile.label--default-profile', 'Default')
                    : profile.name}
                />
              </span>
              {#if profile.isCurrent}
                <span class="badge">
                  <Text
                    color="mono-low"
                    size="meta"
                    text={$i18n.t('dialog--switch-profile.label--current-profile', 'Current')}
                  />
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>

    <div class="section">
      <div class="section-label">
        <Text
          color="mono-low"
          size="body-small"
          text={$i18n.t('dialog--switch-profile.label--create-new', 'Create New Profile')}
        />
      </div>
      <Input
        bind:value={newProfileName}
        oninput={handleInput}
        id="new-profile-name"
        label={$i18n.t('dialog--switch-profile.label--profile-name-input', 'Profile name')}
        help={$i18n.t(
          'dialog--switch-profile.hint--profile-name-rules',
          'Only lowercase letters (a-z) and numbers are allowed.',
        )}
        error={newNameError}
      />
    </div>

    <div class="restart-hint">
      <Text
        color="mono-low"
        size="body-small"
        text={$i18n.t(
          'dialog--switch-profile.prose--restart-hint',
          'The app will close and reopen with the selected profile.',
        )}
      />
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    gap: rem(16px);
    padding: 0 rem(16px);

    .section {
      display: flex;
      flex-direction: column;
      gap: rem(8px);
    }

    .profiles {
      display: flex;
      flex-direction: column;
      gap: rem(4px);
      margin: 0;
      padding: 0;
      list-style: none;

      .profile {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: rem(8px);
        width: 100%;
        padding: rem(10px) rem(12px);
        border: rem(1px) solid transparent;
        border-radius: rem(8px);
        background-color: transparent;
        color: inherit;
        text-align: start;
        cursor: pointer;

        &:hover:not(:disabled) {
          background-color: var(--ic-list-element-background-color--hover);
        }

        &.selected {
          border-color: var(--t-color-primary);
        }

        &:disabled {
          cursor: default;
        }

        .badge {
          flex: 0 0 auto;
        }
      }
    }

    .restart-hint {
      padding-bottom: rem(4px);
    }
  }
</style>
