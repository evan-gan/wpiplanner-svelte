<!--
  The copyable `?share=` link for the schedule on screen.

  `ShareWidget` was a read-only text box; this adds the copy button it lacked,
  and falls back to selecting the text when the clipboard API is unavailable.
-->
<script lang="ts">
  import { buildShareUrl } from '$lib/share/shareCode';

  interface Props {
    sectionIds: string[];
    /** Injectable so the link can be built without a live location. */
    currentUrl: string;
  }

  let { sectionIds, currentUrl }: Props = $props();

  const url = $derived(buildShareUrl(currentUrl, sectionIds));

  let input: HTMLInputElement | undefined = $state();
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // No clipboard permission: select the text so Ctrl+C still works.
      input?.select();
    }
  }
</script>

<div class="share">
  <label for="share-url">Link to this schedule</label>
  <div class="row">
    <input id="share-url" bind:this={input} type="text" readonly value={url} />
    <button type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  </div>
</div>

<style>
  .share {
    padding: var(--space-2);
    min-width: 260px;
  }

  label {
    display: block;
    font-size: var(--font-size-small);
    margin-bottom: var(--space-1);
  }

  .row {
    display: flex;
    gap: var(--space-2);
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    font: inherit;
    font-size: var(--font-size-small);
    padding: var(--space-1);
  }

  button {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-small);
    padding: var(--space-1) var(--space-2);
  }
</style>
