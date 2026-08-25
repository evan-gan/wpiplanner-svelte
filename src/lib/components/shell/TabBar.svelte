<!--
  The four tabs, in the order `TabList.addTab` added them: Courses, Info, Times,
  Schedules.

  The old app swapped a `SimplePanel`'s contents and tracked the selection by
  hand; these are links, so each tab is its own URL and the back button works.
  The `sched-TopButton*` shapes — the crimson wedge with the rounded top-right
  corner and the overlapping z-order — are preserved.
-->
<script lang="ts">
  import { page } from '$app/stores';

  interface Tab {
    href: string;
    label: string;
    title: string;
    /** Tabs are dimmed and unclickable until a course is chosen. */
    enabled: boolean;
  }

  interface Props {
    /** Times and Schedules need at least one chosen course. */
    hasCourses: boolean;
  }

  let { hasCourses }: Props = $props();

  const tabs = $derived<Tab[]>([
    {
      href: '/courses',
      label: 'Courses',
      title: 'Browse and choose courses that you wish to attend',
      enabled: true,
    },
    { href: '/info', label: 'Info', title: 'Description on how to use the scheduler', enabled: true },
    {
      href: '/times',
      label: 'Times',
      title: 'Choose times to disallow courses',
      enabled: hasCourses,
    },
    {
      href: '/schedules',
      label: 'Schedules',
      title: 'List of available courses',
      enabled: hasCourses,
    },
  ]);

  const currentPath = $derived($page.url.pathname);
</script>

<ul>
  {#each tabs as tab, index (tab.href)}
    <li style:z-index={tabs.length - index}>
      {#if tab.enabled}
        <a
          href={tab.href}
          title={tab.title}
          class:selected={currentPath.startsWith(tab.href)}
          aria-current={currentPath.startsWith(tab.href) ? 'page' : undefined}
        >
          {tab.label}
        </a>
      {:else}
        <span class="disabled" title="Choose a course first">{tab.label}</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    display: flex;
    align-items: stretch;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  li {
    position: relative;
    display: flex;
  }

  a,
  .disabled {
    display: flex;
    align-items: center;
    font-size: var(--font-size-tab);
    padding: 0 40px;
    text-decoration: none;
    border-radius: 0 75px 0 0;
    white-space: nowrap;
    /* The wedge shape: each tab tucks under the one to its left. */
    margin-left: -30px;
  }

  a {
    background: var(--wpi-crimson);
    color: var(--text);
    box-shadow: inset -10px 0 10px -10px black;
    cursor: pointer;
  }

  a:hover {
    background: var(--wpi-crimson-hover);
  }

  a.selected {
    color: var(--text-on-brand);
    box-shadow: inset -20px 0 10px -10px white;
  }

  .disabled {
    background: var(--tab-disabled-bg);
    color: gray;
    box-shadow: inset -10px 0 10px -10px gray;
    cursor: default;
  }

  @media (max-width: 900px) {
    a,
    .disabled {
      font-size: 15px;
      padding: 0 20px;
      margin-left: -14px;
    }
  }
</style>
