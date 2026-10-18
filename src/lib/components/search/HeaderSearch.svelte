<!--
  The search box in the crimson header, and the panel that drops out of it.

  Results update on every keystroke. The panel is drawn as a crimson extension
  of the header itself — a tab hanging from the bar — with concave fillets where
  its sides meet the bar's bottom edge, so it reads as part of the header rather
  than a floating popup. It opens over a quarter second so it does not snap.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { getAppState } from '$lib/state/app.svelte';
  import SearchResults from './SearchResults.svelte';

  const app = getAppState();

  let query = $state('');
  let focused = $state(false);
  let root: HTMLDivElement;
  let input: HTMLInputElement;

  const results = $derived(app.search.search(query));
  const open = $derived(focused && query.trim() !== '');

  /**
   * Show a course on the Courses tab, ticking its department so the course
   * table actually contains the row being selected.
   */
  function openCourse(courseId: string) {
    const department = app.catalog.getDepartmentOfCourse(courseId);
    if (department !== undefined && !app.selectedDepartments.includes(department.abbrev)) {
      app.setSelectedDepartments([...app.selectedDepartments, department.abbrev]);
    }
    app.selectedCourseId = courseId;
    input.blur();
    void goto('/courses/');
  }

  function toggleChosen(courseId: string) {
    if (app.selection.hasCourse(courseId)) app.removeCourse(courseId);
    else app.addCourse(courseId);
  }

  /** Focus moving between the input and a result button must not close the panel. */
  function onFocusOut(event: FocusEvent) {
    if (!root.contains(event.relatedTarget as Node | null)) focused = false;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (query === '') input.blur();
    else query = '';
  }
</script>

<div
  class="search"
  class:open
  bind:this={root}
  onfocusin={() => (focused = true)}
  onfocusout={onFocusOut}
>
  <label class="field">
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="2" />
    </svg>
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      placeholder="Search classes or professors"
      aria-label="Search classes or professors"
      autocomplete="off"
      spellcheck="false"
      onkeydown={onKeyDown}
    />
  </label>

  <div class="drop" aria-hidden={!open} inert={!open}>
    <div class="drop-clip">
      <div class="drop-body">
        <SearchResults
          {results}
          isChosen={(courseId) => app.selection.hasCourse(courseId)}
          onopen={openCourse}
          ontoggleChosen={toggleChosen}
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* One knob for the fillet radius and the open/close timing. */
  .search {
    --fillet: 14px;
    --open-duration: 250ms;

    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    /* Full header height, so the panel's top edge is the header's bottom edge. */
    height: 100%;
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 0 var(--space-3);
    height: 30px;
    background: var(--surface);
    border-radius: 15px;
    color: var(--text-muted);
    cursor: text;
  }

  .field:focus-within {
    box-shadow: 0 0 0 2px rgb(255 255 255 / 0.6);
  }

  .icon {
    flex: 0 0 14px;
    height: 14px;
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    font: inherit;
    color: var(--text);
  }

  /*
    The dropped panel hangs from the bottom of the header. It is wider than the
    input so the two result boxes have room, and centred under it.
  */
  .drop {
    position: absolute;
    /* 100% is the top of the header's bottom border, which the panel then covers: no seam. */
    top: 100%;
    left: 50%;
    width: min(620px, calc(100vw - 2 * var(--fillet) - 16px));
    transform: translateX(-50%);
    z-index: 100;
    pointer-events: none;
  }

  .open .drop {
    pointer-events: auto;
  }

  /* Concave corners: crimson squares with a quarter circle cut from the far corner. */
  .drop::before,
  .drop::after {
    content: '';
    position: absolute;
    top: 0;
    width: var(--fillet);
    height: var(--fillet);
    opacity: 0;
    transition: opacity var(--open-duration) ease;
  }

  .drop::before {
    left: calc(-1 * var(--fillet));
    background: radial-gradient(
      circle at 0 100%,
      transparent calc(var(--fillet) - 0.5px),
      var(--wpi-crimson) var(--fillet)
    );
  }

  .drop::after {
    right: calc(-1 * var(--fillet));
    background: radial-gradient(
      circle at 100% 100%,
      transparent calc(var(--fillet) - 0.5px),
      var(--wpi-crimson) var(--fillet)
    );
  }

  .open .drop::before,
  .open .drop::after {
    opacity: 1;
  }

  /* Animating grid rows from 0fr to 1fr is how a box eases to its content height. */
  .drop-clip {
    display: grid;
    grid-template-rows: 0fr;
    background: var(--wpi-crimson);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    box-shadow: 0 6px 14px rgb(0 0 0 / 0);
    transition:
      grid-template-rows var(--open-duration) ease,
      box-shadow var(--open-duration) ease;
  }

  .open .drop-clip {
    grid-template-rows: 1fr;
    box-shadow: 0 6px 14px rgb(0 0 0 / 0.25);
  }

  .drop-body {
    min-height: 0;
    overflow: hidden;
    padding: 0 var(--space-3);
    transition: padding var(--open-duration) ease;
  }

  .open .drop-body {
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  @media (prefers-reduced-motion: reduce) {
    .search {
      --open-duration: 0ms;
    }
  }
</style>
