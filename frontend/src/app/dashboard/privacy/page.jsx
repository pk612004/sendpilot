export const metadata = { title: 'Privacy Policy · SendPilot' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: November 2026</p>

      <div className="mt-8 space-y-6 leading-relaxed">
        <p>
          SendPilot is a personal portfolio project by Prakash Kumar. It shows how an email campaign
          scheduler works. This page explains what data it uses.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">What we collect</h2>
          <p className="mt-2">
            When you sign in with Google, we receive your name, email address and profile photo. We use
            them only to create your account and show who is signed in. We do not access your Gmail,
            contacts or any other Google data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">What you add</h2>
          <p className="mt-2">
            Campaigns, email addresses you upload and message text are stored so the app can schedule
            them. On the live demo, emails are not delivered to real inboxes. If you connect Slack, we
            store the webhook for the channel you choose, encrypted, so we can post limit alerts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Sharing</h2>
          <p className="mt-2">We do not sell or share your data with anyone.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Deleting your data</h2>
          <p className="mt-2">
            You can disconnect Slack at any time from the sidebar. To delete your account and all your
            data, email{' '}
            <a className="text-green-700 underline" href="mailto:pk612004@gmail.com">
              pk612004@gmail.com
            </a>
            .
          </p>
        </section>
      </div>

      <a href="/" className="mt-10 inline-block text-sm text-green-700 underline">
        Back to SendPilot
      </a>
    </main>
  );
}