<!--
  The "Background" block under a course description: prerequisites,
  recommended and suggested background, corequisites, and courses that cannot
  both be taken for credit. Renders nothing for an entry with none of these.
-->
<script lang="ts">
  import type { ShippedBackgroundEntry } from '$lib/model/courseBackground';
  import {
    clauseLabel,
    clauseTimingNote,
    describeRequirementLines,
    formatCourseId,
  } from '$lib/model/courseBackgroundText';

  interface Props {
    entry: ShippedBackgroundEntry;
  }

  let { entry }: Props = $props();
</script>

<div class="background">
  <div class="heading">Background</div>
  {#each entry.clauses as clause, index (index)}
    {@const lines = describeRequirementLines(clause.requirement)}
    {@const timingNote = clauseTimingNote(clause)}
    <div class="clause">
      <b>{clauseLabel(clause)}{#if timingNote}&nbsp;<span class="timing">({timingNote})</span>{/if}: </b>
      {#if lines.length === 1}
        <span>{lines[0]}</span>
      {:else}
        <ul>
          {#each lines as line, lineIndex (lineIndex)}
            <li>{line}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
  {#if entry.noCreditWith.length > 0}
    <div class="clause">
      <b>No credit for both this and: </b>
      <span>{entry.noCreditWith.map(formatCourseId).join(', ')}</span>
    </div>
  {/if}
</div>

<style>
  .background {
    margin-top: 15px;
  }

  .heading {
    font-weight: bold;
  }

  .clause {
    margin-top: 4px;
  }

  .timing {
    font-weight: normal;
    color: var(--text-muted);
  }

  ul {
    margin: 2px 0 0;
    padding-left: 20px;
  }
</style>
