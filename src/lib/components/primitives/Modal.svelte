<!--
  A modal dialog over a dimmed backdrop.

  Replaces GWT's `DialogBox` with `setGlassEnabled(true)`. Built on the native
  `<dialog>` element, so focus trapping and Escape-to-close come from the
  browser rather than being reimplemented.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: Snippet;
    children: Snippet;
    onclose: () => void;
    /** Width of the panel; the period dialog wants a wide one. */
    width?: string;
  }

  let { open, title, children, onclose, width = '640px' }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (dialog === undefined) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  /** A click on the backdrop lands on the dialog element itself. */
  function onBackdropClick(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }
</script>

<dialog bind:this={dialog} style:width onclose={onclose} onclick={onBackdropClick}>
  <header>
    <div class="title">{@render title()}</div>
    <button type="button" class="close" onclick={onclose} aria-label="Close">×</button>
  </header>
  <div class="body">
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    max-width: 95vw;
    max-height: 90vh;
    padding: 0;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--surface-alt);
  }

  .title {
    font-weight: bold;
    min-width: 0;
  }

  .close {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 var(--space-2);
  }

  .body {
    padding: var(--space-3);
    overflow: auto;
    max-height: calc(90vh - 48px);
  }
</style>
