// src/lib/xtream/types.ts
// Lean types for Xtream Codes API responses — only fields we actually use.

export interface VodCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface VodStream {
  num: number;
  stream_id: number;
  name: string;
  stream_type: string;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
}

export interface VodInfo {
  info: {
    movie_image: string;
    tmdb_id: string;
    name: string;
    o_name: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releasedate: string;
    duration: string;
    duration_secs: number;
    rating: string;
    backdrop_path: string[];
  };
  movie_data: {
    stream_id: number;
    name: string;
    added: string;
    container_extension: string;
  };
}

// SeriesCategory has same shape as VodCategory
export type SeriesCategory = VodCategory;

export interface Series {
  num: number;
  series_id: number;
  name: string;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  rating: string;
  rating_5based: number;
  category_id: string;
  backdrop_path: string[];
}

export interface Episode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    movie_image: string;
    plot: string;
    duration_secs: number;
    duration: string;
    rating: string;
  };
}

export interface SeriesInfo {
  info: {
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    rating: string;
    backdrop_path: string[];
  };
  episodes: Record<string, Episode[]>;
}
