/**
 * Subject code -> department name.
 *
 * The Workday feed carries `Academic_Units` ("Mathematical Sciences
 * Department"), but that field is a semicolon-joined list of every owning unit,
 * so a cross-listed course names two of them and the same department appears
 * under several spellings. The subject code in `Course_Section` ("MA 1021-A01")
 * is the only single-valued department key in the feed, so names are looked up
 * from this table instead — the same table the legacy Java converter carried in
 * `Schedb.generateAllDepartments()`.
 *
 * Add a row here when the registrar introduces a subject code; until then such a
 * course lands in "Other" and is reported as an `unknown-subject` anomaly.
 */

/** Where courses go when their subject code is not in the table below. */
export const FALLBACK_DEPARTMENT_ABBREV = 'OT';

export const DEPARTMENT_NAMES: ReadonlyMap<string, string> = new Map([
  ['AB', 'Arabic'],
  ['ACC', 'Accounting'],
  ['AE', 'Aerospace Engineering'],
  ['AR', 'Art'],
  ['ARCH', 'Architecture'],
  ['AREN', 'Architectural Engineering'],
  ['AS', 'Air Science'],
  ['BB', 'Biology'],
  ['BCB', 'Bioinformatics & Computational Biology'],
  ['BME', 'Biomedical Engineering'],
  ['BUS', 'Business'],
  ['CE', 'Civil Engineering'],
  ['CH', 'Chemistry'],
  ['CHE', 'Chemical Engineering'],
  ['CN', 'Chinese'],
  ['CS', 'Computer Science'],
  ['CP', 'Co-op'],
  ['DEV', 'Development'],
  ['DS', 'Data Science'],
  ['ECE', 'Electrical & Computer Engineering'],
  ['ECON', 'Economics'],
  ['EDU', 'Teacher Education'],
  ['EN', 'English'],
  ['ENV', 'Environmental Studies'],
  ['ES', 'Engineering Science'],
  ['ESL', 'English as a Second Language'],
  ['ETR', 'Entrepreneurship'],
  ['FIN', 'Finance'],
  ['FP', 'Fire Protection'],
  ['FY', 'First Year'],
  ['GE', 'Geology'],
  ['GN', 'German'],
  ['GOV', 'Government, Political Science, and Law'],
  ['HI', 'History'],
  ['HU', 'Humanities'],
  ['ID', 'Interdisciplinary'],
  ['IDG', 'Interdisciplinary-Graduate'],
  ['IGS', 'Integrative & Global Studies'],
  ['IMGD', 'Interactive Media & Game Development'],
  ['INTL', 'International & Global Studies'],
  ['ISE', 'Integrated Skills in English'],
  ['JP', 'Japanese'],
  ['MA', 'Mathematical Sciences'],
  ['ME', 'Mechanical Engineering'],
  ['MFE', 'Manufacturing Engineering'],
  ['MIS', 'Management Information Systems'],
  ['MKT', 'Marketing'],
  ['ML', 'Military Leadership'],
  ['MME', 'Mathematics for Educators'],
  ['MPE', 'Physics for Educators'],
  ['MTE', 'Materials Science & Engineering'],
  ['MU', 'Music'],
  ['NEU', 'Neuroscience'],
  ['NSE', 'Nuclear Science & Engineering'],
  ['OBC', 'Organizational Behavior & Change'],
  ['OIE', 'Operations & Industrial Engineering'],
  [FALLBACK_DEPARTMENT_ABBREV, 'Other'],
  ['PC', 'Project Center'],
  ['PH', 'Physics'],
  ['PSY', 'Psychology'],
  ['PY', 'Philosophy'],
  ['RBE', 'Robotics Engineering'],
  ['RE', 'Religion'],
  ['SD', 'System Dynamics'],
  ['SEME', 'Science, Engineering, Math Education'],
  ['SOC', 'Sociology'],
  ['SP', 'Spanish'],
  ['SS', 'Social Science'],
  ['STS', 'Society-Technology Studies'],
  ['SYS', 'Systems Engineering'],
  ['TH', 'Theatre'],
  ['WR', 'Writing'],
  ['WPE', 'Wellness & Physical Education'],
]);

export function isKnownSubject(subjectCode: string): boolean {
  return DEPARTMENT_NAMES.has(subjectCode);
}

/** The department a subject code belongs to, falling back to "Other". */
export function departmentForSubject(subjectCode: string): { abbrev: string; name: string } {
  const name = DEPARTMENT_NAMES.get(subjectCode);
  if (name !== undefined) return { abbrev: subjectCode, name };

  return {
    abbrev: FALLBACK_DEPARTMENT_ABBREV,
    name: DEPARTMENT_NAMES.get(FALLBACK_DEPARTMENT_ABBREV)!,
  };
}
