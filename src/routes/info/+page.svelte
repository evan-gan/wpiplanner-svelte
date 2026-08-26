<!--
  The Info tab.

  Content carried over verbatim from `WelcomeView.ui.xml`, including the video
  and the colour legend. Only the layout is different: two floated
  `display:inline-block` blocks become a grid that stacks on a narrow screen.
-->
<script lang="ts">
</script>

<div class="info">
  <section class="guide">
    <h2>How to use Planner</h2>
    <div class="video">
      <iframe
        src="https://www.youtube.com/embed/QSEwh-V5uYg"
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>

    <h2>Changes not shown in the above video:</h2>
    <ul>
      <li>
        The term icons have more colors:
        <ul>
          <li>Green: the term is enabled and has available seats.</li>
          <li>
            Blue: the term is enabled and has no available seats, but has spots on the waitlist.
          </li>
          <li>Orange: the term is enabled but has no available seats or spots on the waitlist.</li>
          <li>
            Red: the term is disabled. This color is only shown in the bottom right in the Courses
            box and Schedules tab.
          </li>
        </ul>
      </li>
      <li>
        Instead of the Closed/Waitlisted tab, this version has a red warning symbol next to the name
        when the class or section is filled with no spots on the waitlist, or a blue warning symbol
        when the class is filled but has slots on the waitlist. If you cannot see the different
        color warning icons on your browser, hover over the icon to see which warning it is.
      </li>
      <li>CRNs no longer exist due to the switch to workday.</li>
    </ul>
  </section>

  <section class="about">
    <h2>Planner App Information:</h2>
    <p>Based on the WPI Scheduler IQP by:</p>
    <ul>
      <li>Henrique Polido</li>
      <li>Ryan Anthony</li>
      <li>Douglas Lally</li>
    </ul>
    <p>Updated for compatibility with Workday schedule data by:</p>
    <ul>
      <li>Jordyn McKeen</li>
      <li>Nick Markou</li>
    </ul>
    <p>In collaboration with the WPI IT Web Development Team.</p>
    <p>Rewritten from Java (GWT) to Svelte, with the following added, by Evan Gan:</p>
    <ul>
      <li>Import your registered courses straight from a Workday export.</li>
      <li>Export a schedule to your calendar as an <code>.ics</code> file.</li>
      <li>Filter a course's sections by professor.</li>
      <li>Name and save favorite schedules.</li>
    </ul>
  </section>
</div>

<style>
  .info {
    position: absolute;
    inset: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
    gap: var(--space-5);
    padding: var(--space-5);
    align-items: start;
  }

  section {
    border: 4px solid gray;
    background: #c4c4c4;
    padding: var(--space-3);
    text-align: center;
  }

  .video {
    /* 560x315 in the original — kept as a ratio so it scales down. */
    position: relative;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    aspect-ratio: 560 / 315;
  }

  .video iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }

  ul,
  p {
    text-align: left;
    font-size: 15px;
  }

  @media (max-width: 900px) {
    .info {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
