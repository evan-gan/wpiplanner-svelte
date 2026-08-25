<!-- A button with a pressed state. GWT's `ToggleButton`. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    pressed: boolean;
    onclick: () => void;
    children: Snippet;
    title?: string;
  }

  let { pressed, onclick, children, title }: Props = $props();
</script>

<button type="button" class:pressed aria-pressed={pressed} {title} {onclick}>
  {@render children()}
</button>

<style>
  button {
    padding: 3px 5px;
    font-size: small;
    cursor: pointer;
    border: 1px solid var(--border-muted);
    border-bottom-color: #a0a0a0;
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
  }

  button:hover {
    background: var(--surface-hover);
  }

  button.pressed {
    background: var(--border-subtle);
    box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.25);
  }
</style>
