use crate::models::{Channel, EpgEntry};
use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqlitePoolOptions, Row, SqlitePool};
use std::path::Path;

/// Initialise (or open) the local SQLite EPG cache.
///
/// Creates the schema on first run. The path is typically
/// `~/.config/foundry-tv/epg.db` on Linux.
pub async fn init_db(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let url = format!(
        "sqlite://{}?mode=rwc",
        path.to_str().expect("non-UTF8 db path")
    );
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS channels (
            id       TEXT PRIMARY KEY,
            name     TEXT NOT NULL,
            grp      TEXT,
            logo_url TEXT,
            tvg_id   TEXT
        );

        CREATE TABLE IF NOT EXISTS epg (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
            start_at    TEXT NOT NULL,
            end_at      TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT,
            UNIQUE (channel_id, start_at)
        );

        CREATE INDEX IF NOT EXISTS epg_channel_time
            ON epg (channel_id, start_at);
        "#,
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}

/// Insert or update a batch of channels.
pub async fn upsert_channels(pool: &SqlitePool, channels: &[Channel]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for ch in channels {
        sqlx::query(
            r#"
            INSERT INTO channels (id, name, grp, logo_url, tvg_id)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
                name     = excluded.name,
                grp      = excluded.grp,
                logo_url = excluded.logo_url,
                tvg_id   = excluded.tvg_id
            "#,
        )
        .bind(&ch.id)
        .bind(&ch.name)
        .bind(&ch.group)
        .bind(&ch.logo_url)
        .bind(&ch.tvg_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

/// Insert or update a batch of EPG entries.
pub async fn upsert_epg(pool: &SqlitePool, entries: &[EpgEntry]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for e in entries {
        sqlx::query(
            r#"
            INSERT INTO epg (channel_id, start_at, end_at, title, description)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(channel_id, start_at) DO UPDATE SET
                end_at      = excluded.end_at,
                title       = excluded.title,
                description = excluded.description
            "#,
        )
        .bind(&e.channel_id)
        .bind(e.start.to_rfc3339())
        .bind(e.end.to_rfc3339())
        .bind(&e.title)
        .bind(&e.description)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

/// Query channels by group/category. Pass `None` for all channels.
pub async fn query_channels_by_group(
    pool: &SqlitePool,
    group: Option<&str>,
) -> Result<Vec<Channel>, sqlx::Error> {
    let rows = if let Some(g) = group {
        sqlx::query(
            "SELECT id, name, grp, logo_url, tvg_id FROM channels WHERE grp = ?1 ORDER BY name",
        )
        .bind(g)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query("SELECT id, name, grp, logo_url, tvg_id FROM channels ORDER BY name")
            .fetch_all(pool)
            .await?
    };

    rows.iter()
        .map(|row| {
            Ok(Channel {
                id: row.try_get("id")?,
                name: row.try_get("name")?,
                group: row.try_get("grp")?,
                logo_url: row.try_get("logo_url")?,
                tvg_id: row.try_get("tvg_id")?,
            })
        })
        .collect()
}

/// Query EPG entries for a channel within a time window.
pub async fn query_epg_for_channel(
    pool: &SqlitePool,
    channel_id: &str,
    since: DateTime<Utc>,
    until: DateTime<Utc>,
) -> Result<Vec<EpgEntry>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT channel_id, start_at, end_at, title, description
        FROM epg
        WHERE channel_id = ?1
          AND end_at   > ?2
          AND start_at < ?3
        ORDER BY start_at
        "#,
    )
    .bind(channel_id)
    .bind(since.to_rfc3339())
    .bind(until.to_rfc3339())
    .fetch_all(pool)
    .await?;

    rows.iter()
        .map(|row| {
            let start_str: String = row.try_get("start_at")?;
            let end_str: String = row.try_get("end_at")?;
            let start = start_str
                .parse::<DateTime<Utc>>()
                .unwrap_or(Utc::now());
            let end = end_str
                .parse::<DateTime<Utc>>()
                .unwrap_or(Utc::now());
            Ok(EpgEntry {
                channel_id: row.try_get("channel_id")?,
                start,
                end,
                title: row.try_get("title")?,
                description: row.try_get("description")?,
            })
        })
        .collect()
}
