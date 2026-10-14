'use client';

import { useParams } from 'next/navigation';
import { GuestView } from '@/features/share/GuestView';

/** /share/{token}: a read-only canvas opened from a share link. No sign-in. */
export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  return <GuestView token={token} />;
}
