export const metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <p className="text-lg font-medium" style={{ color: 'var(--fg)' }}>
        Notifications
      </p>
      <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
        No notifications yet.
      </p>
    </div>
  );
}
