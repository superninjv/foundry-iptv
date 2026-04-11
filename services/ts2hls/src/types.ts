export type Quality = 'source' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p';
export const VALID_QUALITIES: readonly Quality[] = ['source', '2160p', '1440p', '1080p', '720p', '480p', '360p'] as const;

export interface Session {
  sid: string;
  channelUrl: string;
  channelId?: string;
  quality?: Quality;
  hlsDir: string;
  hlsUrl: string;
  pid: number;
  lastAccess: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export type StreamMode = 'live' | 'vod';

export interface CreateSessionRequest {
  channelUrl: string;
  mode?: StreamMode;
  channelId?: string;
  quality?: Quality;
}

export interface CreateSessionResponse {
  sid: string;
  hlsUrl: string;
  sourceWidth?: number;
  sourceHeight?: number;
}
