import { requireAuth } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import Link from 'next/link';
import { formatDate } from '@/lib/format/time';
import CreateListForm from '@/components/CreateListForm';

export const metadata = { title: 'Custom Lists' };

interface ListRow {
  id: string;
  name: string;
  kind: string;
  channel_count: string;
  updated_at: Date;
}

const kindColors: Record<string, string> = {
  playlist: 'var(--accent)',
  parlay: 'var(--success)',
  dashboard: '#a78bfa',
};

export default async function ListsPage() {
  const user = await requireAuth();

  const result = await query<ListRow>(
    `SELECT l.id, l.name, l.kind, l.updated_at,
            COALESCE(c.cnt, 0) AS channel_count
     FROM iptv_custom_lists l
     LEFT JOIN (
       SELECT list_id, COUNT(*) AS cnt
       FROM iptv_custom_list_channels
       GROUP BY list_id
     ) c ON c.list_id = l.id
     WHERE l.user_id = $1
     ORDER BY l.updated_at DESC`,
    [user.id],
  );

  const lists = result.rows;

  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>
          Custom Lists
        </h1>
      </div>

      <CreateListForm />

      {lists.length === 0 ? (
        <div
          className="mt-12 flex flex-col items-center justify-center rounded-xl border p-12 text-center"
          style={{
            backgroundColor: 'var(--bg-raised)',
            borderColor: 'var(--border)',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--fg-muted)' }}
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <p className="mt-4 text-lg" style={{ color: 'var(--fg-muted)' }}>
            No custom lists yet.
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
            Create one to organize your channels.
          </p>
        </div>
      ) : (
        <div
          className="mt-4 grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="group rounded-xl border p-4 transition-colors"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border)',
                minHeight: '48px',
              }}
            >
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
                  {list.name}
                </h2>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: `${kindColors[list.kind] || 'var(--fg-muted)'}20`,
                    color: kindColors[list.kind] || 'var(--fg-muted)',
                  }}
                >
                  {list.kind}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm" style={{ color: 'var(--fg-muted)' }}>
                <span>{Number(list.channel_count)} channel{Number(list.channel_count) !== 1 ? 's' : ''}</span>
                <span>
                  Updated {formatDate(list.updated_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
