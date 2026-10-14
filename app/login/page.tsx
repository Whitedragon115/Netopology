import { Suspense } from 'react';
import { LoginScreen } from '@/features/auth/LoginScreen';

export const metadata = { title: 'Sign in · Netopology' };

export default function LoginPage() {
  // LoginScreen reads ?next= and ?error= (useSearchParams needs a Suspense boundary)
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
