<!--
  The department multi-select, grouped by academic area.

  The six groups below are copied verbatim from `DepartmentListBox.groups`, in
  the same order, including the duplicated "SS" in Social Science; any
  department the lists do not mention falls into "Other", as it did before.
-->
<script lang="ts">
  import type { Catalog } from '$lib/model/catalog';
  import type { DepartmentJson } from '$lib/model/schedb';

  interface AcademicGroup {
    name: string;
    departments: string[];
  }

  const ACADEMIC_GROUPS: AcademicGroup[] = [
    {
      name: 'Science',
      departments: ['MA', 'PH', 'BB', 'BCB', 'CH', 'CS', 'GE', 'DS', 'IMGD', 'MMS', 'MPE', 'MME', 'NEU'],
    },
    {
      name: 'Engineering',
      departments: ['ECE', 'RBE', 'AREN', 'ARCH', 'BME', 'CE', 'CHE', 'ES', 'ME', 'MFE', 'MTE', 'NSE', 'FP', 'SYS', 'AE'],
    },
    { name: 'Language', departments: ['GN', 'AB', 'CN', 'ESL', 'JP', 'ISE', 'SP'] },
    { name: 'Humanities', departments: ['PY', 'AR', 'HI', 'HU', 'MU', 'RE', 'TH', 'WR', 'EN', 'INTL'] },
    {
      name: 'Social Science',
      departments: ['ECON', 'SS', 'PSY', 'DEV', 'ENV', 'GOV', 'SS', 'SD', 'SOC', 'STS'],
    },
    { name: 'Business', departments: ['BUS', 'ETR', 'FIN', 'MIS', 'MKT', 'OBC', 'ACC', 'OIE'] },
  ];

  const OTHER_GROUP = 'Other';

  interface Props {
    catalog: Catalog;
    selected: string[];
    onchange: (abbrevs: string[]) => void;
  }

  let { catalog, selected, onchange }: Props = $props();

  /** Departments bucketed into their group, groups in the declared order. */
  const grouped = $derived.by(() => {
    const buckets = new Map<string, DepartmentJson[]>();
    for (const group of ACADEMIC_GROUPS) buckets.set(group.name, []);
    buckets.set(OTHER_GROUP, []);

    for (const department of catalog.departments) {
      const group = ACADEMIC_GROUPS.find((candidate) =>
        candidate.departments.includes(department.abbrev),
      );
      buckets.get(group?.name ?? OTHER_GROUP)!.push(department);
    }

    return [...buckets].filter(([, departments]) => departments.length > 0);
  });

  function onSelectChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    onchange([...select.selectedOptions].map((option) => option.value));
  }
</script>

<select multiple size={20} onchange={onSelectChange} aria-label="Departments">
  {#each grouped as [groupName, departments] (groupName)}
    <optgroup label={groupName}>
      {#each departments as department (department.abbrev)}
        <option value={department.abbrev} selected={selected.includes(department.abbrev)}>
          {department.name}
        </option>
      {/each}
    </optgroup>
  {/each}
</select>

<style>
  select {
    height: 100%;
    width: 100%;
    border-width: 0;
    margin: 0;
    font: inherit;
  }
</style>
