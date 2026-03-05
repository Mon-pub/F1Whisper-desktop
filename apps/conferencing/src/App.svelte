<script lang="ts">
  import {Button} from '@threema/ui';

  const themes = ['consumer', 'work', 'onprem'] as const;
  type Theme = (typeof themes)[number];

  let currentTheme = $state<Theme>(
    (document.documentElement.dataset.theme as Theme | undefined) ?? 'consumer',
  );

  function setTheme(theme: Theme): void {
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }
</script>

<main
  class="flex min-h-screen flex-col items-center justify-center gap-8 bg-white p-8 dark:bg-black"
>
  <h1 class="text-3xl font-bold text-primary-700">Threema Conferencing</h1>

  <p class="text-neutral-600 max-w-md text-center">Welcome to Threema Conferencing.</p>

  <div class="flex flex-wrap justify-center gap-4">
    <Button variant="primary">Join Call</Button>
    <Button variant="secondary">Learn More</Button>
  </div>

  <label>
    Theme:
    <select value={currentTheme} onchange={(event) => setTheme(event.currentTarget.value as Theme)}>
      {#each themes as theme (theme)}
        <option value={theme}>{theme}</option>
      {/each}
    </select>
  </label>

  <p class="text-neutral-400 text-sm">
    The buttons above use <code class="font-mono">@threema/ui</code>, themed via
    <code class="font-mono">@threema/branding</code>.
  </p>
</main>
