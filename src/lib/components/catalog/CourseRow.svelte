<!--
  One course in the browse list: add/remove button, abbreviation, term badges,
  warning icon, name.

  The legacy `CourseListItemBase` built this as a `<tr>` of hand-sized `<td>`s
  (36px, 100px, 128px); the widths are the same, the construction is not.
-->
<script lang="ts">
  import { courseAvailability } from '$lib/model/availability';
  import type { CourseJson } from '$lib/model/schedb';
  import WarningIcon from '$lib/components/primitives/WarningIcon.svelte';
  import TermBadges from './TermBadges.svelte';

  interface Props {
    course: CourseJson;
    abbrev: string;
    chosen: boolean;
    selected: boolean;
    onselect: () => void;
    ontoggleChosen: () => void;
  }

  let { course, abbrev, chosen, selected, onselect, ontoggleChosen }: Props = $props();

  const availability = $derived(courseAvailability(course.sections));
</script>

<tr class:selected onclick={onselect}>
  <td class="add">
    <button
      type="button"
      class:chosen
      title={chosen ? `Remove ${abbrev}` : `Add ${abbrev}`}
      aria-label={chosen ? `Remove ${abbrev}` : `Add ${abbrev}`}
      onclick={(event) => {
        event.stopPropagation();
        ontoggleChosen();
      }}
    >
      {chosen ? '−' : '+'}
    </button>
  </td>
  <td class="abbrev">{abbrev}</td>
  <td class="terms"><TermBadges {course} /></td>
  <td class="name">
    <WarningIcon {availability} />
    {course.name}
  </td>
</tr>

<style>
  tr {
    cursor: pointer;
  }

  tr.selected {
    outline: 2px solid var(--wpi-crimson);
    outline-offset: -2px;
  }

  td {
    padding: 3px;
  }

  .add {
    width: 36px;
    text-align: center;
  }

  /* Circular toggle: flex centring keeps the glyph optically centred, which
     padding alone cannot do for `+` and `−` at different heights. */
  .add button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin: 0 auto;
    padding: 0;
    line-height: 1;
    cursor: pointer;
    border: 1px solid var(--toggle-add);
    border-radius: 50%;
    background: var(--toggle-add-bg);
    color: var(--toggle-add);
    font-size: 15px;
    font-weight: bold;
  }

  .add button.chosen {
    border-color: var(--toggle-remove);
    background: var(--toggle-remove-bg);
    color: var(--toggle-remove);
  }

  .abbrev {
    width: 100px;
    text-align: center;
  }

  .terms {
    width: 128px;
  }
</style>
