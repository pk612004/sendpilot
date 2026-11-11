export const metadata = { title: 'Terms of Service · SendPilot' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-semibold text-gray-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: November 2026</p>

      <div className="mt-8 space-y-6 leading-relaxed">
        <p>
          SendPilot is a free portfolio project by Prakash Kumar, made to demonstrate email scheduling.
          By using it you agree to these simple terms.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Use it only for testing and learning. Do not upload real people's email addresses without
            their permission.
          </li>
          <li>Do not use it to send spam or anything illegal.</li>
          <li>
            The service is provided as is, with no guarantee that it will always be available. Data may
            be reset at any time.
          </li>
          <li>
            See the{' '}
            <a className="text-green-700 underline" href="/privacy">
              Privacy Policy
            </a>{' '}
            for how data is handled.
          </li>
        </ul>
        <p>
          Questions:{' '}
          <a className="text-green-700 underline" href="mailto:pk612004@gmail.com">
            pk612004@gmail.com
          </a>
        </p>
      </div>

      <a href="/" className="mt-10 inline-block text-sm text-green-700 underline">
        Back to SendPilot
      </a>
    </main>
  );
}