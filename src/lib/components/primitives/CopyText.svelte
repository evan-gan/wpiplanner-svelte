<!--
  A piece of text that copies itself on click, e.g. a course code to paste into
  another site's search. Copies on the press itself, with no confirm step, and
  flashes green briefly afterwards — no "Copy" label, so several fit in a
  header. Without clipboard permission the text is selected instead, so Ctrl+C
  still works.
-->
<script lang="ts">
  interface Props {
    text: string;
    /** Read by screen readers and shown on hover, e.g. "Copy course code". */
    label?: string;
  }

  let { text, label = 'Copy' }: Props = $props();

  const CONFIRMATION_MS = 1200;

  let copied = $state(false);
  let textElement: HTMLSpanElement | undefined = $state();
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => (copied = false), CONFIRMATION_MS);
    } catch (error) {
      console.warn(`Clipboard write refused (${(error as Error).message}); selecting the text for Ctrl+C instead.`);
      selectText();
    }
  }

  function selectText() {
    if (textElement === undefined) return;
    const range = document.createRange();
    range.selectNodeContents(textElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  $effect(() => () => clearTimeout(hideTimer));
</script>

<button
  type="button"
  class="copy-text"
  class:copied
  title={label}
  aria-label="{label}: {text}"
  onclick={copyText}
>
  <span bind:this={textElement}>{text}</span>
</button>
<span class="visually-hidden" aria-live="polite">{copied ? `Copied ${text}` : ''}</span>

<style>
  .copy-text {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    padding: 0 var(--space-2);
    white-space: nowrap;
  }

  .copy-text:hover {
    background: var(--surface-alt);
  }

  .copy-text.copied {
    border-color: var(--copy-done);
    background: var(--copy-done-bg);
    color: var(--copy-done);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
