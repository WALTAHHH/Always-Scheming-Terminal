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
          last_error: string | null;
          consecutive_errors: number;
          last_success_at: string | null;
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
          last_error?: string | null;
          consecutive_errors?: number;
          last_success_at?: string | null;
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
          last_error?: string | null;
          consecutive_errors?: number;
          last_success_at?: string | null;
          created_at?: string;
        };
      };
      items: {
        Row: {
          id: string;
          source_id: string | null;
          external_id: string | null;
          title: string;
          body: string | null;
          url: string;
          author: string | null;
          published_at: string | null;
          ingested_at: string;
          tags: Json;
          content_type: string;
          signals_extracted_at: string | null;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          external_id?: string | null;
          title: string;
          body?: string | null;
          url: string;
          author?: string | null;
          published_at?: string | null;
          ingested_at?: string;
          tags?: Json;
          content_type?: string;
          signals_extracted_at?: string | null;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          external_id?: string | null;
          title?: string;
          body?: string | null;
          url?: string;
          author?: string | null;
          published_at?: string | null;
          ingested_at?: string;
          tags?: Json;
          content_type?: string;
          signals_extracted_at?: string | null;
        };
      };
      content_tags: {
        Row: {
          id: string;
          item_id: string;
          dimension: string;
          value: string;
          confidence: number | null;
          manual: boolean;
          entity_id: string | null; // MANUALLY ADDED — pending migration 006_content_tags_entity_fk.sql
        };
        Insert: {
          id?: string;
          item_id: string;
          dimension: string;
          value: string;
          confidence?: number | null;
          manual?: boolean;
          entity_id?: string | null; // MANUALLY ADDED — pending migration 006_content_tags_entity_fk.sql
        };
        Update: {
          id?: string;
          item_id?: string;
          dimension?: string;
          value?: string;
          confidence?: number | null;
          manual?: boolean;
          entity_id?: string | null; // MANUALLY ADDED — pending migration 006_content_tags_entity_fk.sql
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
      ingestion_logs: {
        Row: {
          id: string;
          source_id: string | null;
          started_at: string;
          fetched: number;
          inserted: number;
          errors: string[];
          success: boolean;
          duration_ms: number;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          started_at?: string;
          fetched?: number;
          inserted?: number;
          errors?: string[];
          success?: boolean;
          duration_ms?: number;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          started_at?: string;
          fetched?: number;
          inserted?: number;
          errors?: string[];
          success?: boolean;
          duration_ms?: number;
        };
      };
      signals: {
        Row: {
          id: string;
          item_id: string;
          signal_type: 'acquisition' | 'fundraising' | 'earnings' | 'layoffs' | 'leadership' | 'product_launch' | 'regulatory' | 'platform_change' | 'macro';
          summary: string;
          investment_relevance_score: number;
          raw_llm_output: Json | null;
          model_used: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          signal_type: 'acquisition' | 'fundraising' | 'earnings' | 'layoffs' | 'leadership' | 'product_launch' | 'regulatory' | 'platform_change' | 'macro';
          summary: string;
          investment_relevance_score: number;
          raw_llm_output?: Json | null;
          model_used?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          signal_type?: 'acquisition' | 'fundraising' | 'earnings' | 'layoffs' | 'leadership' | 'product_launch' | 'regulatory' | 'platform_change' | 'macro';
          summary?: string;
          investment_relevance_score?: number;
          raw_llm_output?: Json | null;
          model_used?: string | null;
          created_at?: string;
        };
      };
      entities: {
        Row: {
          id: string;
          canonical_name: string;
          entity_type: 'company' | 'person' | 'game' | 'event' | 'org';
          ticker: string | null;
          exchange: string | null;
          is_public: boolean;
          parent_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          canonical_name: string;
          entity_type: 'company' | 'person' | 'game' | 'event' | 'org';
          ticker?: string | null;
          exchange?: string | null;
          is_public?: boolean;
          parent_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          canonical_name?: string;
          entity_type?: 'company' | 'person' | 'game' | 'event' | 'org';
          ticker?: string | null;
          exchange?: string | null;
          is_public?: boolean;
          parent_id?: string | null;
          description?: string | null;
          created_at?: string;
        };
      };
      entity_aliases: {
        Row: {
          id: string;
          entity_id: string;
          alias: string;
          alias_type: 'canonical' | 'ticker' | 'common' | 'game_title' | 'abbreviation' | 'former_name' | 'product';
        };
        Insert: {
          id?: string;
          entity_id: string;
          alias: string;
          alias_type: 'canonical' | 'ticker' | 'common' | 'game_title' | 'abbreviation' | 'former_name' | 'product';
        };
        Update: {
          id?: string;
          entity_id?: string;
          alias?: string;
          alias_type?: 'canonical' | 'ticker' | 'common' | 'game_title' | 'abbreviation' | 'former_name' | 'product';
        };
      };
      api_keys: {
        Row: {
          id: string;
          key_hash: string;
          label: string;
          owner: string;
          scopes: Json;
          rate_limit_rpm: number;
          last_used_at: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          key_hash: string;
          label: string;
          owner: string;
          scopes?: Json;
          rate_limit_rpm?: number;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          key_hash?: string;
          label?: string;
          owner?: string;
          scopes?: Json;
          rate_limit_rpm?: number;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
      };
    };
  };
}

// Convenience types
export type Source = Database["public"]["Tables"]["sources"]["Row"];
export type Item = Database["public"]["Tables"]["items"]["Row"];
export type ItemTag = Database["public"]["Tables"]["content_tags"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type IngestionLog = Database["public"]["Tables"]["ingestion_logs"]["Row"];
export type Signal = Database["public"]["Tables"]["signals"]["Row"];
export type Entity = Database["public"]["Tables"]["entities"]["Row"];
export type EntityAlias = Database["public"]["Tables"]["entity_aliases"]["Row"];
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];

// Extended item with source info for the feed
export type FeedItem = Item & {
  sources: Pick<Source, "name" | "url" | "source_type"> | null;
};
