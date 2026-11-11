<!--
  Loads a course's structured background and shows it: the "Background" block
  when it was read from this exact description, a "not checked yet" note when
  it is unchecked or stale, and nothing for a course with none.
-->
<script lang="ts">
  import type { CourseBackgroundStatus } from '$lib/model/courseBackground';
  import { uncheckedBackgroundNote } from '$lib/model/courseBackgroundText';
  import { loadCourseBackground } from '$lib/data/courseBackground';
  import CourseBackground from './CourseBackground.svelte';

  interface Props {
    courseId: string;
    /** The catalog description, so a stale entry is not shown as current. */
    description: string;
  }

  let { courseId, description }: Props = $props();

  // Null while loading, so neither the block nor the "not checked" note flashes up for the wrong course.
  let background = $state<CourseBackgroundStatus | null>(null);
  const backgroundNote = $derived(background === null ? null : uncheckedBackgroundNote(background.status));

  $effect(() => {
    background = null;
    // Clicking through courses quickly can resolve loads out of order; only the latest may land.
    let superseded = false;
    loadCourseBackground(courseId, description).then((known) => {
      if (!superseded) background = known;
    });
    return () => {
      superseded = true;
    };
  });
</script>

{#if background?.status === 'hasBackground'}
  <CourseBackground entry={background.entry} />
{:else if backgroundNote !== null}
  <p class="unchecked-note">{backgroundNote}</p>
{/if}

<style>
  .unchecked-note {
    margin: 15px 0 0;
    font-style: italic;
    color: var(--text-muted);
  }
</style>
