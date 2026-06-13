export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      api_keys: {
        Row: {
          id: string
          key_hash: string
          label: string
          owner: string
          scopes: Json
          rate_limit_rpm: number
          last_used_at: string | null
          created_at: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          key_hash: string
          label: string
          owner: string
          scopes: Json
          rate_limit_rpm: number
          last_used_at?: string | null
          created_at?: string | null
          revoked_at?: string | null
        }
        Update: {
          id?: string
          key_hash?: string
          label?: string
          owner?: string
          scopes?: Json
          rate_limit_rpm?: number
          last_used_at?: string | null
          created_at?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          name: string
          slug: string | null
          ticker: string | null
          is_public: boolean | null
          sector: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug?: string | null
          ticker?: string | null
          is_public?: boolean | null
          sector?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string | null
          ticker?: string | null
          is_public?: boolean | null
          sector?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      content: {
        Row: {
          id: string
          source_id: string | null
          external_id: string | null
          title: string
          body: string | null
          url: string
          author: string | null
          published_at: string | null
          ingested_at: string | null
          tags: Json | null
          content_type: string
          embedding: string | null
          signals_extracted_at: string | null
        }
        Insert: {
          id?: string
          source_id?: string | null
          external_id?: string | null
          title: string
          body?: string | null
          url: string
          author?: string | null
          published_at?: string | null
          ingested_at?: string | null
          tags?: Json | null
          content_type: string
          embedding?: string | null
          signals_extracted_at?: string | null
        }
        Update: {
          id?: string
          source_id?: string | null
          external_id?: string | null
          title?: string
          body?: string | null
          url?: string
          author?: string | null
          published_at?: string | null
          ingested_at?: string | null
          tags?: Json | null
          content_type?: string
          embedding?: string | null
          signals_extracted_at?: string | null
        }
        Relationships: []
      }
      content_tags: {
        Row: {
          id: string
          content_id: string | null
          dimension: string
          value: string
          confidence: number | null
          manual: boolean | null
          entity_id: string | null
        }
        Insert: {
          id?: string
          content_id?: string | null
          dimension: string
          value: string
          confidence?: number | null
          manual?: boolean | null
          entity_id?: string | null
        }
        Update: {
          id?: string
          content_id?: string | null
          dimension?: string
          value?: string
          confidence?: number | null
          manual?: boolean | null
          entity_id?: string | null
        }
        Relationships: []
      }
      content_topics: {
        Row: {
          content_id: string
          topic_id: string
          confidence: number | null
        }
        Insert: {
          content_id: string
          topic_id: string
          confidence?: number | null
        }
        Update: {
          content_id?: string
          topic_id?: string
          confidence?: number | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          id: string
          canonical_name: string
          entity_type: string
          metadata: Json | null
          created_at: string | null
          ir_url: string | null
          sec_url: string | null
          segment: string | null
          market_cap_b: number | null
          ticker: string | null
          exchange: string | null
          is_public: boolean | null
          parent_id: string | null
          description: string | null
        }
        Insert: {
          id?: string
          canonical_name: string
          entity_type: string
          metadata?: Json | null
          created_at?: string | null
          ir_url?: string | null
          sec_url?: string | null
          segment?: string | null
          market_cap_b?: number | null
          ticker?: string | null
          exchange?: string | null
          is_public?: boolean | null
          parent_id?: string | null
          description?: string | null
        }
        Update: {
          id?: string
          canonical_name?: string
          entity_type?: string
          metadata?: Json | null
          created_at?: string | null
          ir_url?: string | null
          sec_url?: string | null
          segment?: string | null
          market_cap_b?: number | null
          ticker?: string | null
          exchange?: string | null
          is_public?: boolean | null
          parent_id?: string | null
          description?: string | null
        }
        Relationships: []
      }
      entity_aliases: {
        Row: {
          entity_id: string
          alias: string
          id: string | null
          alias_type: string | null
        }
        Insert: {
          entity_id: string
          alias: string
          id?: string | null
          alias_type?: string | null
        }
        Update: {
          entity_id?: string
          alias?: string
          id?: string | null
          alias_type?: string | null
        }
        Relationships: []
      }
      entity_mentions: {
        Row: {
          id: string
          content_id: string
          entity_id: string
          context: string | null
          sentiment: number | null
        }
        Insert: {
          id?: string
          content_id: string
          entity_id: string
          context?: string | null
          sentiment?: number | null
        }
        Update: {
          id?: string
          content_id?: string
          entity_id?: string
          context?: string | null
          sentiment?: number | null
        }
        Relationships: []
      }
      event_entities: {
        Row: {
          event_id: string
          entity_id: string
          role: string
        }
        Insert: {
          event_id: string
          entity_id: string
          role: string
        }
        Update: {
          event_id?: string
          entity_id?: string
          role?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          content_id: string | null
          event_type: string
          signal_weight: string
          rationale: string | null
          extracted_at: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          content_id?: string | null
          event_type: string
          signal_weight: string
          rationale?: string | null
          extracted_at?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          content_id?: string | null
          event_type?: string
          signal_weight?: string
          rationale?: string | null
          extracted_at?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      ingestion_logs: {
        Row: {
          id: string
          source_id: string | null
          started_at: string | null
          fetched: number | null
          inserted: number | null
          errors: Json | null
          success: boolean | null
          duration_ms: number | null
        }
        Insert: {
          id?: string
          source_id?: string | null
          started_at?: string | null
          fetched?: number | null
          inserted?: number | null
          errors?: Json | null
          success?: boolean | null
          duration_ms?: number | null
        }
        Update: {
          id?: string
          source_id?: string | null
          started_at?: string | null
          fetched?: number | null
          inserted?: number | null
          errors?: Json | null
          success?: boolean | null
          duration_ms?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          role: string
          subscription_tier: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          role: string
          subscription_tier: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          role?: string
          subscription_tier?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          id: string
          item_id: string
          signal_type: string
          summary: string
          investment_relevance_score: number
          raw_llm_output: Json | null
          model_used: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          item_id: string
          signal_type: string
          summary: string
          investment_relevance_score: number
          raw_llm_output?: Json | null
          model_used?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          signal_type?: string
          summary?: string
          investment_relevance_score?: number
          raw_llm_output?: Json | null
          model_used?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      sources: {
        Row: {
          id: string
          name: string
          url: string
          feed_url: string
          source_type: string
          active: boolean | null
          last_fetched_at: string | null
          created_at: string | null
          last_error: string | null
          consecutive_errors: number | null
          last_success_at: string | null
        }
        Insert: {
          id?: string
          name: string
          url: string
          feed_url: string
          source_type: string
          active?: boolean | null
          last_fetched_at?: string | null
          created_at?: string | null
          last_error?: string | null
          consecutive_errors?: number | null
          last_success_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          url?: string
          feed_url?: string
          source_type?: string
          active?: boolean | null
          last_fetched_at?: string | null
          created_at?: string | null
          last_error?: string | null
          consecutive_errors?: number | null
          last_success_at?: string | null
        }
        Relationships: []
      }
      topics: {
        Row: {
          id: string
          slug: string
          label: string
          parent_id: string | null
        }
        Insert: {
          id?: string
          slug: string
          label: string
          parent_id?: string | null
        }
        Update: {
          id?: string
          slug?: string
          label?: string
          parent_id?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          interests: Json | null
          segments: Json | null
          notification_prefs: Json
          digest_frequency: string | null
          theme: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          interests?: Json | null
          segments?: Json | null
          notification_prefs: Json
          digest_frequency?: string | null
          theme?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          interests?: Json | null
          segments?: Json | null
          notification_prefs?: Json
          digest_frequency?: string | null
          theme?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

// Convenience type aliases
export type Source = Database["public"]["Tables"]["sources"]["Row"]
export type Content = Database["public"]["Tables"]["content"]["Row"]
export type ContentTag = Database["public"]["Tables"]["content_tags"]["Row"]
export type Entity = Database["public"]["Tables"]["entities"]["Row"]
export type EntityAlias = Database["public"]["Tables"]["entity_aliases"]["Row"]
export type Signal = Database["public"]["Tables"]["signals"]["Row"]
export type IngestionLog = Database["public"]["Tables"]["ingestion_logs"]["Row"]
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type UserPreferences = Database["public"]["Tables"]["user_preferences"]["Row"]
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"]

// Legacy aliases (backward compat)
export type Item = Content
export type ItemTag = ContentTag

// Extended content row with joined source — used throughout the feed UI
export type FeedItem = Content & {
  sources: Pick<Source, "name" | "url" | "source_type"> | null
}
