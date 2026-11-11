'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useDashboard } from '@/lib/dashboard-context';
import { bodyToSafeHtml } from '@/lib/sanitize';
import { formatLong } from '@/lib/format';
import { StatusPill, useStars } from '@/components/EmailList';
import { Avatar, IconButton, Spinner } from '@/components/ui';
import { ArrowLeftIcon, ExternalIcon, StarIcon } from '@/components/icons';

function EmailView() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const { user } = useDashboard();
  const id = Number(params.id);
  const backTab = search.get('from') === 'sent' ? 'sent' : 'scheduled';
  const [email, setEmail] = useState(null);
  const [error, setError] = useState(null);
  const { stars, toggle } = useStars();

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .email(id)
        .then((e) => alive && setEmail(e))
        .catch(
          (e) => alive && setError(e instanceof ApiError && e.status === 404 ? 'Email not found' : e.message),
        );
    load();
    // keep the status live while it's still waiting to be sent
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  const safeHtml = useMemo(() => (email ? bodyToSafeHtml(email.body) : ''), [email]);
  const back = () => router.push(`/dashboard?tab=${backTab}`);

  return (
    <div className="min-h-screen bg-white">
      {/* header: back + subject, actions + avatar */}
      <header className="flex items-center gap-3 px-4 py-3">
        <IconButton label="Back" onClick={back}>
          <ArrowLeftIcon size={18} />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg text-gray-900">{email?.subject ?? ' '}</h1>
        {email && (
          <IconButton
            label={stars.has(email.id) ? 'Unstar' : 'Star'}
            onClick={() => toggle(email.id)}
            className={stars.has(email.id) ? 'text-amber-400' : ''}
          >
            <StarIcon size={16} filled={stars.has(email.id)} />
          </IconButton>
        )}
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <Avatar src={user.avatar_url} name={user.name} size={28} />
      </header>

      {error ? (
        <p className="py-24 text-center text-sm text-gray-500">{error}</p>
      ) : !email ? (
        <div className="flex justify-center py-24 text-gray-400">
          <Spinner />
        </div>
      ) : (
        <article className="mx-auto max-w-3xl px-6 pb-16 pt-4">
          <div className="flex items-start gap-3">
            <Avatar name={email.sender_name} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-semibold text-gray-900">{email.sender_name}</span>{' '}
                <span className="text-xs text-gray-500">&lt;{email.sender_email}&gt;</span>
              </div>
              <div className="text-xs text-gray-500">to {email.to_email}</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{formatLong(email.sent_at ?? email.send_at)}</div>
              <div className="mt-1">
                <StatusPill item={email} />
              </div>
            </div>
          </div>

          {/* body: sanitised on the server when saved AND here before rendering */}
          <div
            className="email-body mt-6 space-y-1 pl-12 text-sm leading-relaxed text-gray-800"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />

          {/* delivery details */}
          <div className="mt-10 space-y-1 border-t border-gray-100 pl-12 pt-4 text-xs text-gray-500">
            {email.status === 'scheduled' && (
              <p>
                Scheduled for {formatLong(email.send_at)}
                {email.deferred_count ? ` · moved ${email.deferred_count}× by the hourly limit` : ''}
              </p>
            )}
            {email.last_error && email.status !== 'sent' && (
              <p className="text-red-600">{email.last_error}</p>
            )}
            {email.message_id && (
              <p>
                Message-ID: <code>{email.message_id}</code>
              </p>
            )}
            {email.preview_url && (
              <a
                href={email.preview_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
              >
                View in Ethereal <ExternalIcon size={12} />
              </a>
            )}
          </div>
        </article>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <EmailView />
    </Suspense>
  );
}
