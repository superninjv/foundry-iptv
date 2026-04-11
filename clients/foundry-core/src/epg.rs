use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::Path;

/// Initialise (or open) the local SQLite EPG cache.
///
/// Creates the schema on first run. The path is typically
/// `~/.config/foundry-tv/epg.db` on Linux or the app data dir on Android.
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
            logo_url TEXT
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
