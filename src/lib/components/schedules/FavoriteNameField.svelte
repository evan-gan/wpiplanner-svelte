<!--
  The name of one favourited schedule, edited in place.

  Click the label to edit; Enter or blur commits, Escape restores what was there
  before. A blank commit is allowed — the parent decides what an unnamed
  favourite reads as — so a student can clear a name without deleting the star.

  Reading and editing share one box, so clicking a name only greys it rather than
  changing its size: the box keeps its padding and border either way, and the
  input is sized to its own text by a hidden copy of that text in the same grid
  cell, which is the only way to make a text input shrink-to-fit in CSS.
-->
<script lang="ts">
  interface Props {
    name: string;
    /** Shown when `name` is blank, both as the label and as the input hint. */
    placeholder: string;
    onrename: (name: string) => void;
    /** Compact form for the thumbnail strip, where there is no room. */
    small?: boolean;
  }

  let { name, placeholder, onrename, small = false }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  /** What the box is currently showing, which is what it has to be wide enough for. */
  const shownText = $derived(editing ? draft : name);

  function startEditing() {
    draft = name;
    editing = true;
  }

  function commit() {
    if (!editing) return;
    editing = false;
    if (draft.trim() !== name) onrename(draft);
  }

  function cancel() {
    editing = false;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }

  // Focusing from an effect rather than the click handler keeps the behaviour
  // the same whether editing was started by mouse or by keyboard.
  $effect(() => {
    if (editing) input?.select();
  });
</script>

<span class="box" class:editing class:small>
  {#if editing}
    <!-- The pseudo-element copy of this value is what gives the input its width. -->
    <span class="sizer" data-value={shownText === '' ? placeholder : shownText}>
      <input
        bind:this={input}
        bind:value={draft}
        type="text"
        {placeholder}
        maxlength="60"
        aria-label="Schedule name"
        onblur={commit}
        {onkeydown}
      />
    </span>
  {:else}
    <button
      type="button"
      class="text"
      class:unnamed={name === ''}
      onclick={startEditing}
      title="Rename this favorite"
    >
      {name === '' ? placeholder : name}
    </button>
  {/if}

  <span class="pencil" aria-hidden="true">✎</span>
</span>

<style>
  .box {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-1);
    max-width: 100%;
    padding: 2px var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: text;
  }

  .box:hover {
    border-color: var(--border-muted);
  }

  .box.editing {
    border-color: var(--border-muted);
    background: var(--surface-hover);
  }

  .small {
    font-size: var(--font-size-small);
  }

  .text {
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unnamed {
    color: var(--text-muted);
    font-style: italic;
  }

  .pencil {
    flex: 0 0 auto;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  /* Input and hidden text share one grid cell, so the cell — and therefore the
     input — is exactly as wide as the text being typed. */
  .sizer {
    display: inline-grid;
    min-width: 0;
    max-width: 100%;
  }

  .sizer::after {
    content: attr(data-value);
    grid-area: 1 / 1;
    font: inherit;
    white-space: pre;
    visibility: hidden;
  }

  .sizer input {
    grid-area: 1 / 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    outline: none;
  }
</style>
