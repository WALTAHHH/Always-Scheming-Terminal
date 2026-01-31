export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          name: string;
          url: string;
          feed_url: string;
          source_type: string;
          active: boolean;
          last_fetched_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          url: string;
          feed_url: string;
          source_type: string;
          active?: boolean;
          last_fetched_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          url?: string;
          feed_url?: string;
          source_type?: string;
          active?: boolean;
          last_fetched_at?: string | null;
          created_at?: string;
        };
      };
      items: {
        Row: {
          id: string;
          source_id: string | null;
          external_id: string | null;
          title: string;
          content: string | null;
          url: string;
          author: string | null;
          published_at: string | null;
          ingested_at: string;
          tags: Json;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          external_id?: string | null;
          title: string;
          content?: string | null;
          url: string;
          author?: string | null;
          published_at?: string | null;
          ingested_at?: string;
          tags?: Json;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          external_id?: string | null;
          title?: string;
          content?: string | null;
          url?: string;
          author?: string | null;
          published_at?: string | null;
          ingested_at?: string;
          tags?: Json;
        };
      };
      item_tags: {
        Row: {
          id: string;
          item_id: string;
          dimension: string;
          value: string;
          confidence: number | null;
          manual: boolean;
        };
        Insert: {
          id?: string;
          item_id: string;
          dimension: string;
          value: string;
          confidence?: number | null;
          manual?: boolean;
        };
        Update: {
          id?: string;
          item_id?: string;
          dimension?: string;
          value?: string;
          confidence?: number | null;
          manual?: boolean;
        };
      };
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          ticker: string | null;
          is_public: boolean;
          sector: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          ticker?: string | null;
          is_public?: boolean;
          sector?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          ticker?: string | null;
          is_public?: boolean;
          sector?: string | null;
          created_at?: string;
        };
      };
    };
  };
}

// Convenience types
export type Source = Database["public"]["Tables"]["sources"]["Row"];
export type Item = Database["public"]["Tables"]["items"]["Row"];
export type ItemTag = Database["public"]["Tables"]["item_tags"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];

// Extended item with source info for the feed
export type FeedItem = Item & {
  sources: Pick<Source, "name" | "url" | "source_type"> | null;
};
