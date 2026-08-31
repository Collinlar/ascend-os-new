// Shown when a page is requested that was never cached and the network is
// down. Never a blank screen or a spinner that never resolves.
export default function Offline() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-ink">No network right now.</h1>
        <p className="mt-3 text-ink-muted">
          Your till still works. Open it and keep selling. Your sales save on
          this device and send themselves when the network returns.
        </p>
        <a
          href="/pos"
          className="tap mt-6 inline-flex items-center bg-teal px-5 py-3 font-medium text-white"
        >
          Open the till
        </a>
      </div>
    </main>
  );
}
