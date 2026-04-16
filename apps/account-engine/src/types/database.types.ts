export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.4';
  };
  public: {
    Tables: {
      job_logs: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          level: Database['public']['Enums']['log_level'];
          message: string;
          metadata: Json | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          level: Database['public']['Enums']['log_level'];
          message: string;
          metadata?: Json | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          level?: Database['public']['Enums']['log_level'];
          message?: string;
          metadata?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'job_logs_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          max_retries: number;
          payload: Json;
          priority: number;
          retry_count: number;
          retry_delay_seconds: number;
          scheduled_at: string;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          max_retries?: number;
          payload: Json;
          priority?: number;
          retry_count?: number;
          retry_delay_seconds?: number;
          scheduled_at?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          max_retries?: number;
          payload?: Json;
          priority?: number;
          retry_count?: number;
          retry_delay_seconds?: number;
          scheduled_at?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          type?: Database['public']['Enums']['job_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_settings: {
        Row: {
          channel_type: string;
          config: Json;
          created_at: string;
          is_enabled: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel_type: string;
          config?: Json;
          created_at?: string;
          is_enabled?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel_type?: string;
          config?: Json;
          created_at?: string;
          is_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          name: string;
          tier: number;
        };
        Insert: {
          code: string;
          name: string;
          tier?: number;
        };
        Update: {
          code?: string;
          name?: string;
          tier?: number;
        };
        Relationships: [];
      };
      portfolio_item_snapshots: {
        Row: {
          asset_dict: Json;
          asset_token_list: Json;
          asset_usd_value: number;
          chain: string;
          debt_usd_value: number;
          detail: Json;
          detail_types: string[];
          has_supported_portfolio: boolean;
          id: string;
          id_raw: string;
          logo_url: string | null;
          name: string;
          name_item: string;
          net_usd_value: number;
          pool: Json;
          proxy_detail: Json;
          site_url: string;
          snapshot_at: string | null;
          snapshot_date_utc: string | null;
          update_at: number;
          wallet: string;
          wallet_lower: string | null;
        };
        Insert: {
          asset_dict: Json;
          asset_token_list: Json;
          asset_usd_value: number;
          chain: string;
          debt_usd_value: number;
          detail: Json;
          detail_types: string[];
          has_supported_portfolio: boolean;
          id?: string;
          id_raw: string;
          logo_url?: string | null;
          name: string;
          name_item: string;
          net_usd_value: number;
          pool: Json;
          proxy_detail: Json;
          site_url: string;
          snapshot_at?: string | null;
          snapshot_date_utc?: string | null;
          update_at: number;
          wallet: string;
          wallet_lower?: string | null;
        };
        Update: {
          asset_dict?: Json;
          asset_token_list?: Json;
          asset_usd_value?: number;
          chain?: string;
          debt_usd_value?: number;
          detail?: Json;
          detail_types?: string[];
          has_supported_portfolio?: boolean;
          id?: string;
          id_raw?: string;
          logo_url?: string | null;
          name?: string;
          name_item?: string;
          net_usd_value?: number;
          pool?: Json;
          proxy_detail?: Json;
          site_url?: string;
          snapshot_at?: string | null;
          snapshot_date_utc?: string | null;
          update_at?: number;
          wallet?: string;
          wallet_lower?: string | null;
        };
        Relationships: [];
      };
      telegram_verification_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          token: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          token: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          token?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'telegram_verification_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_crypto_wallets: {
        Row: {
          created_at: string;
          id: string;
          label: string | null;
          last_portfolio_update_at: string | null;
          user_id: string;
          wallet: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label?: string | null;
          last_portfolio_update_at?: string | null;
          user_id: string;
          wallet: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string | null;
          last_portfolio_update_at?: string | null;
          user_id?: string;
          wallet?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_crypto_wallets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_subscriptions: {
        Row: {
          created_at: string;
          ends_at: string | null;
          id: string;
          is_canceled: boolean;
          plan_code: string;
          starts_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          is_canceled?: boolean;
          plan_code: string;
          starts_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          is_canceled?: boolean;
          plan_code?: string;
          starts_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_subscriptions_plan_code_fkey';
            columns: ['plan_code'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'user_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          is_subscribed_to_reports: boolean;
          last_activity_at: string | null;
          telegram_username: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          is_subscribed_to_reports?: boolean;
          last_activity_at?: string | null;
          telegram_username?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          is_subscribed_to_reports?: boolean;
          last_activity_at?: string | null;
          telegram_username?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      daily_portfolio_snapshots: {
        Row: {
          asset_dict: Json | null;
          asset_token_list: Json | null;
          asset_usd_value: number | null;
          chain: string | null;
          debt_usd_value: number | null;
          detail: Json | null;
          detail_types: string[] | null;
          has_supported_portfolio: boolean | null;
          id: string | null;
          id_raw: string | null;
          logo_url: string | null;
          name: string | null;
          name_item: string | null;
          net_usd_value: number | null;
          pool: Json | null;
          proxy_detail: Json | null;
          site_url: string | null;
          snapshot_at: string | null;
          snapshot_date: string | null;
          update_at: number | null;
          wallet: string | null;
        };
        Relationships: [];
      };
      portfolio_category_trend_mv: {
        Row: {
          category: string | null;
          category_assets_usd: number | null;
          category_debt_usd: number | null;
          category_value_usd: number | null;
          date: string | null;
          pnl_usd: number | null;
          source_type: string | null;
          total_value_usd: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      regime_transitions_view: {
        Row: {
          from_regime: Database['public']['Enums']['regime_id'] | null;
          id: string | null;
          sentiment_value: number | null;
          source: string | null;
          to_regime: Database['public']['Enums']['regime_id'] | null;
          transitioned_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      classify_token_category: { Args: { symbol: string }; Returns: string };
      cleanup_expired_telegram_tokens: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      create_etl_job_for_wallet: {
        Args: {
          p_ip_address?: string;
          p_job_type?: string;
          p_user_agent?: string;
          p_user_id: string;
          p_wallet_address: string;
        };
        Returns: {
          job_id: string;
          message: string;
          rate_limited: boolean;
          status: string;
        }[];
      };
      create_user_with_wallet_and_plan: {
        Args: {
          p_plan_code?: string;
          p_wallet: string;
          p_wallet_label?: string;
        };
        Returns: Json;
      };
      get_etl_job_status: {
        Args: { p_job_id: string };
        Returns: {
          completed_at: string;
          created_at: string;
          error_message: string;
          job_id: string;
          status: string;
        }[];
      };
      get_next_etl_job: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          job_type: string;
          max_retries: number;
          retry_count: number;
          status: string;
          user_id: string;
          wallet_address: string;
        }[];
      };
      get_users_wallets_by_ids: {
        Args: { user_ids: string[] };
        Returns: {
          user_id: string;
          wallet: string;
        }[];
      };
      get_users_wallets_by_plan: {
        Args: { p_plan_code: string };
        Returns: {
          email: string;
          user_id: string;
          wallet: string;
        }[];
      };
      get_users_wallets_by_plan_with_activity: {
        Args: { plan_name: string };
        Returns: {
          last_activity_at: string;
          last_portfolio_update_at: string;
          user_id: string;
          wallet: string;
        }[];
      };
      select_one: { Args: Record<PropertyKey, never>; Returns: number };
      show_limit: { Args: Record<PropertyKey, never>; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      update_user_email_and_upgrade_plan: {
        Args: {
          p_email: string;
          p_upgrade_plan_code?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      job_status:
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'retrying'
        | 'cancelled';
      job_type:
        | 'weekly_report_batch'
        | 'weekly_report_single'
        | 'email_notification';
      log_level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
      regime_id: 'ef' | 'f' | 'n' | 'g' | 'eg';
    };
    CompositeTypes: Record<string, never>;
  };
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      job_status: [
        'pending',
        'processing',
        'completed',
        'failed',
        'retrying',
        'cancelled',
      ],
      job_type: [
        'weekly_report_batch',
        'weekly_report_single',
        'email_notification',
      ],
      log_level: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
      regime_id: ['ef', 'f', 'n', 'g', 'eg'],
    },
  },
} as const;
