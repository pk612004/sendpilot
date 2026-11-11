'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, GOOGLE_LOGIN_URL } from '@/lib/api';
import { GoogleIcon } from '@/components/icons';

const ERRORS = {
  invalid_state: 'Login expired or was tampered with. Please try again.',
  login_failed: 'Google login failed. Please try again.',
  access_denied: 'You cancelled the Google login.',
};

/** Login screen. Google OAuth is the only real login. */
function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get('error');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api
      .me()
      .then(() => router.replace('/dashboard'))
      .catch(() => {});
  }, [router]);

  const onEmailLogin = (e) => {
    e.preventDefault();
    // Only Google login is supported; email/password accounts are not implemented.
    setNotice('Email sign-in isn’t enabled for this demo. Please use “Login with Google”.');
  };

  const field =
    'w-full rounded-lg bg-field px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[336px] rounded-xl border border-gray-200 px-10 py-10">
        <h1 className="text-center text-[26px] font-semibold text-gray-900">Login</h1>

        <a
          href={GOOGLE_LOGIN_URL}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg bg-brand-50 py-2.5 text-sm text-gray-900 transition hover:bg-brand-100"
        >
          <GoogleIcon size={15} /> Login with Google
        </a>

        {(error || notice) && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {notice ?? ERRORS[error] ?? 'Login failed.'}
          </p>
        )}

        <div className="my-5 flex items-center gap-3 text-[11px] text-gray-400">
          <span className="h-px flex-1 bg-gray-200" /> or sign up through email{' '}
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={onEmailLogin} className="space-y-2.5">
          <input type="email" placeholder="Email ID" aria-label="Email ID" className={field} />
          <input type="password" placeholder="Password" aria-label="Password" className={field} />
          <button
            type="submit"
            className="!mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Login
          </button>
        </form>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
