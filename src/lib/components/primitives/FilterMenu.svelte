<!--
  A funnel button that opens a popover of tick-box filter groups.

  Knows nothing about courses or sections: it renders whatever groups it is
  given and reports ticks back. The caller owns the checked state, so the menu
  always shows what the rest of the UI shows.
-->
<script lang="ts">
  interface FilterMenuOption {
    value: string;
    label: string;
    checked: boolean;
  }

  interface FilterMenuGroup {
    id: string;
    label: string;
    options: FilterMenuOption[];
  }

  interface Props {
    groups: FilterMenuGroup[];
    /** Names what is being filtered, for the tooltip and screen readers. */
    title?: string;
    ontoggle: (groupId: string, value: string, checked: boolean) => void;
  }

  let { groups, title = 'Filter', ontoggle }: Props = $props();

  let open = $state(false);
  let container = $state<HTMLDivElement | null>(null);

  /** Close when the click lands anywhere outside the button and the popover. */
  function onWindowPointerDown(event: PointerEvent) {
    if (!open || container === null) return;
    if (!container.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window
  onpointerdown={onWindowPointerDown}
  onkeydown={(event) => {
    if (event.key === 'Escape') open = false;
  }}
/>

<div class="filter" bind:this={container}>
  <button
    type="button"
    class="trigger"
    class:open
    {title}
    aria-label={title}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <!-- A funnel, drawn inline so it inherits the text colour and needs no font. -->
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M2 3h12l-4.6 5.3v4.3l-2.8 1.6V8.3z"
        fill="currentColor"
      />
    </svg>
  </button>

  {#if open}
    <div class="popover" role="group" aria-label={title}>
      {#each groups as group (group.id)}
        <div class="group">
          <div class="group-label">{group.label}</div>
          {#each group.options as option (option.value)}
            <label>
              <input
                type="checkbox"
                checked={option.checked}
                onchange={(event) =>
                  ontoggle(group.id, option.value, event.currentTarget.checked)}
              />
              <span>{option.label}</span>
            </label>
          {/each}
        </div>
      {/each}

      {#if groups.length === 0}
        <p class="empty">Nothing to filter here.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .filter {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 4px;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: inherit;
    cursor: pointer;
    line-height: 1;
  }

  .trigger.open {
    background: var(--surface-hover);
  }

  .trigger svg {
    width: 12px;
    height: 12px;
    display: block;
  }

  /* Sits above the rail's rows; the rail itself scrolls, so the popover is
     capped and scrolls on its own rather than growing past the pane. */
  .popover {
    position: absolute;
    z-index: 10;
    top: calc(100% + 2px);
    left: 0;
    min-width: 180px;
    max-width: 260px;
    max-height: 260px;
    overflow-y: auto;
    padding: var(--space-2);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    box-shadow: 0 2px 6px rgb(0 0 0 / 25%);
    text-align: left;
    font-weight: normal;
  }

  .group + .group {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-muted);
  }

  .group-label {
    font-weight: bold;
    font-size: var(--font-size-small);
    margin-bottom: var(--space-1);
  }

  label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 1px 0;
    cursor: pointer;
    font-size: var(--font-size-small);
  }

  label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }
</style>
