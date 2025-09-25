<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import {i18n} from '~/app/ui/i18n';
</script>

<header data-build-platform={import.meta.env.BUILD_PLATFORM}>
  <div class="center">
    <Text
      text={$i18n.t('contacts.label--add-contact', 'New Contact')}
      color="mono-high"
      ellipsis
      family="secondary"
      size="body"
      wrap={false}
    />
  </div>
</header>

<style lang="scss">
  @use 'component' as *;

  header {
    display: grid;
    grid-template:
      'left center right'
      / 0 auto 0;
    grid-auto-flow: column;
    justify-content: space-between;
    place-items: center;

    height: 100%;
    user-select: none;

    .center {
      grid-area: center;

      display: flex;
      align-items: center;
      justify-content: center;

      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    &[data-build-platform='macos'] {
      // Use as drag area for the Electron window.
      -webkit-app-region: drag;

      grid-template:
        'left center right'
        / rem(88px) auto rem(88px);
    }
  }
</style>
