import { redirect } from 'next/navigation';
import { getSessionOrNull, homePath } from '@/lib/auth/session';

/** Entry point: signed-in users go to their workspace, everyone else signs in. */
export default async function RootPage() {
  const session = await getSessionOrNull();
  redirect(session ? homePath(session) : '/login');
}
