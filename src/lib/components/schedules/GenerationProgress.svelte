<!--
  The "Looking for schedules..." screen.

  Ported from `CanvasProgress`: one labelled row per course, with a box per
  section, drawn on a canvas. It is a picture of the search tree the generator is
  walking, which is why it is worth showing at all instead of a spinner.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { CourseSectionLists } from '$lib/scheduling/types';

  interface Props {
    catalog: Catalog;
    /** The search input: candidate sections per course. */
    courses: CourseSectionLists;
  }

  let { catalog, courses }: Props = $props();

  /** Height of a section box, from the legacy `lineHeight`. */
  const LINE_HEIGHT = 32;
  const MIN_SECTION_WIDTH = 10;

  let canvas: HTMLCanvasElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);

  function draw() {
    if (canvas === undefined || width === 0 || height === 0) return;

    const context = canvas.getContext('2d');
    if (context === null) return;

    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';

    const courseCount = courses.length;
    if (courseCount === 0) return;

    const maxSections = Math.max(...courses.map((sections) => sections.length));
    if (maxSections === 0) return;

    const sectionSize = Math.max(width / maxSections, MIN_SECTION_WIDTH);
    const rowHeight = height / courseCount;

    for (const [index, sections] of courses.entries()) {
      if (sections.length === 0) continue;

      const rowY = rowHeight * index + rowHeight / 2 - LINE_HEIGHT / 2;
      const boxWidth = Math.max(sectionSize - 10, MIN_SECTION_WIDTH);

      for (const [column, section] of sections.entries()) {
        const x = width / 2 - (sectionSize * sections.length) / 2 + sectionSize * column;

        context.strokeStyle = '#FF0000';
        context.beginPath();
        context.rect(x, rowY, boxWidth, LINE_HEIGHT);
        context.stroke();

        // The section label is rotated to fit a box only ~20px wide.
        context.save();
        context.translate(x + boxWidth / 2, rowY + LINE_HEIGHT / 2);
        context.rotate(Math.PI / 2);
        context.fillStyle = '#000000';
        context.textBaseline = 'middle';
        context.fillText(catalog.getSection(section.id)?.number ?? '', 0, 0);
        context.restore();
      }

      const courseId = sections[0].courseId;
      const course = catalog.getCourse(courseId);
      context.fillStyle = '#000000';
      context.textBaseline = 'bottom';
      context.fillText(
        `${course?.name ?? courseId} (${catalog.courseAbbrev(courseId)})`,
        width / 2,
        rowY - 4,
      );
    }
  }

  $effect(() => {
    void courses;
    void width;
    void height;
    draw();
  });
</script>

<div class="progress" bind:clientWidth={width} bind:clientHeight={height}>
  <p class="label" role="status">Looking for schedules...</p>
  <canvas bind:this={canvas} {width} {height}></canvas>
</div>

<style>
  .progress {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  .label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    margin: 0;
    padding: var(--space-2) var(--space-5);
    border: 1px solid #ccc;
    border-radius: 12px;
    background: var(--surface);
    opacity: 0.95;
    font-size: 40px;
    text-align: center;
    max-width: 90%;
  }

  canvas {
    display: block;
  }
</style>
