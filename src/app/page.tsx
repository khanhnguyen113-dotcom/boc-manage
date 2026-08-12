import { redirect } from 'next/navigation';

import { getSessionUser } from '@/server/auth/current-user';

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? '/dashboard' : '/login');
}
