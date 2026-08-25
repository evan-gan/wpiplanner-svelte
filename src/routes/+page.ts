/** The old app opened on the Courses tab; this route just forwards there. */
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
  redirect(307, '/courses/');
};
