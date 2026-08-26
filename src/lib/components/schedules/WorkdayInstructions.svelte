<!--
  How to get the spreadsheet that `WorkdayImport` reads.

  Workday gives the export no stable name and buries it behind an unlabelled
  icon, so the last step draws the icon rather than describing it — students
  cannot search for a button they can only recognise by shape.
-->
<script lang="ts">
  const WORKDAY_LOGIN_URL = 'https://wd5.myworkday.com/wday/authgwy/wpi/login-saml2.htmld';
  const REPORT_NAME = 'View My Courses';

  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  async function copyReportName() {
    try {
      await navigator.clipboard.writeText(REPORT_NAME);
      copied = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => (copied = false), 2000);
    } catch {
      // No clipboard permission — the name is short enough to retype.
      copied = false;
    }
  }
</script>

<ol class="steps">
  <li>
    Sign in to Workday at
    <a href={WORKDAY_LOGIN_URL} target="_blank" rel="noopener noreferrer">
      wd5.myworkday.com
    </a>, or reach it through
    <a href="https://hub.wpi.edu" target="_blank" rel="noopener noreferrer">hub.wpi.edu</a>.
  </li>

  <li>
    In Workday's search box, type
    <button type="button" class="copyable" onclick={copyReportName} title="Click to copy">
      {REPORT_NAME}
    </button>
    <span class="note">{copied ? '(copied)' : '(click to copy)'}</span>
  </li>

  <li>
    Click the <strong>{REPORT_NAME}</strong> result — (the one with
    <span class="report-label">Report</span> in smaller text underneath it.)
  </li>

  <li>
    <div>
      In the upper-right corner of the class table there is a bank of icons. Click the
      export-to-Excel one — the leftmost, circled below. It is a sheet outline with an
      <strong>X</strong> cut into its left edge and a grid of cells beside it:
    </div>

    <!-- Drawn rather than screenshotted so it stays legible at any zoom and follows the theme. -->
    <svg
      class="icon-bank"
      viewBox="-8 -6 316 100"
      role="img"
      aria-label="Workday's icon bank: the export-to-Excel icon, circled, followed by filter, chart, expand, and two table-layout icons"
    >
      <!-- Export to Excel: a sheet outline notched on the left to hold the X. -->
      <g class="glyph">
        <rect x="8" y="10" width="32" height="42" rx="3" stroke-width="4.5" />
        <!-- Masks out the left edge of the outline so the X sits in the gap. -->
        <rect x="2" y="18" width="18" height="26" class="notch" />
        <g stroke-width="4.5">
          <line x1="6" y1="22" x2="19" y2="40" />
          <line x1="19" y1="22" x2="6" y2="40" />
        </g>
        <g class="solid">
          {#each [0, 1, 2] as row (row)}
            {#each [0, 1] as column (column)}
              <rect x={23 + column * 9} y={17 + row * 10} width="6.5" height="6.5" rx="1" />
            {/each}
          {/each}
        </g>
      </g>

      <!-- Filter: four centred bars with square ends, narrowing downwards. -->
      <g class="glyph" stroke-width="4.5">
        {#each [16, 12, 8, 4] as halfWidth, index (index)}
          <line x1={75 - halfWidth} y1={19 + index * 8.5} x2={75 + halfWidth} y2={19 + index * 8.5} />
        {/each}
      </g>

      <!-- Chart: three outlined bars on a shared baseline. -->
      <g class="glyph" stroke-width="4.5">
        <rect x="106" y="27" width="9" height="19" />
        <rect x="120" y="17" width="9" height="29" />
        <rect x="134" y="35" width="9" height="11" />
      </g>

      <!-- Expand: opposing corner brackets. -->
      <g class="glyph" stroke-width="5" stroke-linejoin="miter">
        <polyline points="168,18 182,18 182,32" />
        <polyline points="156,32 156,46 170,46" />
      </g>

      <!-- The two table-layout buttons, in their grey pill. -->
      <rect x="196" y="4" width="98" height="56" rx="28" class="pill" />
      <!-- The denser layout: an outlined table, three cells across and four down. -->
      <g class="table-glyph" stroke-width="2.5">
        <rect x="209" y="17" width="27" height="28" />
        <line x1="218" y1="17" x2="218" y2="45" />
        <line x1="227" y1="17" x2="227" y2="45" />
        {#each [24, 31, 38] as y (y)}
          <line x1="209" y1={y} x2="236" y2={y} />
        {/each}
      </g>

      <rect x="248" y="9" width="46" height="46" rx="13" class="selected-button" stroke-width="2.5" />
      <!-- The selected layout: an outlined table, three cells across and two down. -->
      <g class="selected-glyph" stroke-width="2.5">
        <rect x="256" y="21" width="30" height="22" />
        <line x1="266" y1="21" x2="266" y2="43" />
        <line x1="276" y1="21" x2="276" y2="43" />
        <line x1="256" y1="32" x2="286" y2="32" />
      </g>

      <!-- The pointer at the icon that matters. -->
      <circle cx="24" cy="31" r="29" class="highlight" stroke-width="2.5" />
      <line x1="24" y1="90" x2="24" y2="76" class="highlight" stroke-width="2.5" stroke-linecap="round" />
      <polygon points="24,64 17,77 31,77" class="highlight-head" />
    </svg>
  </li>

  <li>
    Workday takes a few seconds to prepare the file. When the download is ready, click
    <strong>Download</strong> in the box that appears.
  </li>

  <li>Choose the downloaded <code>.xlsx</code> file here.</li>
</ol>

<style>
  .steps {
    margin: 0;
    padding-left: var(--space-5);
    max-width: 46em;
  }

  .steps li {
    margin-bottom: var(--space-3);
    line-height: 1.5;
  }

  .copyable {
    font: inherit;
    font-weight: bold;
    cursor: pointer;
    padding: 1px 6px;
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
  }

  .copyable:hover {
    background: var(--surface-hover);
  }

  .note,
  .report-label {
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }

  .report-label {
    font-style: italic;
  }

  .icon-bank {
    display: block;
    width: 300px;
    max-width: 100%;
    height: auto;
    margin-top: var(--space-2);
  }

  /* Workday draws the bank in grey; currentColor keeps it legible in any theme.
     Every shape here is an outline unless it opts into `.solid`. */
  .glyph {
    stroke: currentColor;
    fill: none;
    opacity: 0.6;
  }

  .glyph .solid rect {
    fill: currentColor;
    stroke: none;
  }

  /* Punches the sheet outline open where the X sits. */
  .notch {
    fill: var(--surface);
    stroke: none;
  }

  .pill {
    fill: var(--surface-alt);
    stroke: none;
  }

  /* Grid lines rather than filled cells, like the button beside it. */
  .table-glyph {
    fill: none;
    stroke: currentColor;
    opacity: 0.45;
  }

  .selected-button {
    fill: var(--surface);
    stroke: currentColor;
    stroke-opacity: 0.35;
  }

  /* Drawn as grid lines, not filled cells: the cell interiors stay empty. */
  .selected-glyph {
    fill: none;
    stroke: currentColor;
    opacity: 0.85;
  }

  .highlight {
    stroke: var(--wpi-crimson);
    fill: none;
  }

  .highlight-head {
    fill: var(--wpi-crimson);
    stroke: none;
  }

  code {
    font-size: var(--font-size-small);
  }
</style>
