package com.foundry.iptv.player

/**
 * Identifies how a stream URL should be wrapped into an ExoPlayer MediaSource.
 *
 * - [HLS] — live channels and HLS VOD (m3u8). Uses HlsMediaSource.
 * - [PROGRESSIVE] — progressive MP4/MKV VOD and series episodes from Xtream.
 *   Uses ProgressiveMediaSource.
 */
enum class StreamKind { HLS, PROGRESSIVE }
