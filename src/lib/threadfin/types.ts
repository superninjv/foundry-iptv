// src/lib/threadfin/types.ts
// Shared types for Threadfin channel metadata and EPG data.

export interface Channel {
  id: string;           // sha1(providerUrl) prefix — stable across reboots
  epgId: string;        // raw M3U tvg-id (used to join with provider XMLTV); may be ""
  name: string;
  logo: string;
  group: string;        // category
  providerUrl: string;  // actual stream URL from raw provider M3U
}

export interface EpgProgram {
  channelId: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  category?: string;
}

export interface NowNext {
  now?: EpgProgram;
  next?: EpgProgram;
}
