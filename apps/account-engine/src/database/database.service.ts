import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { Logger } from '../common/logger';
import { ConfigService } from '../config/config.service';
import { Database } from '../types/database.types';

export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private supabaseClient!: SupabaseClient<Database>;
  private serviceRoleClient?: SupabaseClient<Database>;

  /* istanbul ignore next -- DI constructor */
  constructor(private configService: ConfigService) {
    this.initializeSupabase();
  }

  private initializeSupabase() {
    const supabaseUrl = this.configService.get<string>('database.supabase.url');
    const supabaseKey = this.configService.get<string>(
      'database.supabase.anonKey',
    );

    if (!supabaseUrl || !supabaseKey) {
      this.logger.error('Supabase URL and ANON_KEY must be provided');
      throw new Error('Missing Supabase configuration');
    }

    this.supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);
    this.logger.log('Supabase client initialized successfully');
  }

  /**
   * Get the Supabase client instance
   */
  getClient(): SupabaseClient<Database> {
    return this.supabaseClient;
  }

  /**
   * Create a new Supabase client with service role key for admin operations.
   *
   * ⚠️ WARNING: This client bypasses Row Level Security (RLS). Use with extreme caution.
   * See CLAUDE.md § "Supabase Service Role Strategy" for security implications and usage guidelines.
   */
  getServiceRoleClient(): SupabaseClient<Database> {
    if (this.serviceRoleClient) {
      return this.serviceRoleClient;
    }

    const supabaseUrl = this.configService.get<string>('database.supabase.url');
    const serviceRoleKey = this.configService.get<string>(
      'database.supabase.serviceRoleKey',
    );

    if (!supabaseUrl || !serviceRoleKey) {
      this.logger.error(
        'Supabase URL and SERVICE_ROLE_KEY must be provided for admin operations',
      );
      throw new Error('Missing Supabase service role configuration');
    }

    this.serviceRoleClient = createClient<Database>(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    return this.serviceRoleClient;
  }

  /**
   * Execute a Supabase RPC (Remote Procedure Call) function with strict type safety.
   *
   * @param functionName - The name of the database function to call (typed and validated)
   * @param args - Arguments to pass to the function (type inferred from function definition)
   * @param options - Optional configuration:
   *   - `useServiceRole: true` - Use service role client (bypasses RLS).
   *     See CLAUDE.md § "Supabase Service Role Strategy" for when to use this option.
   * @returns Promise resolving to the function result (type inferred from function definition)
   */
  async rpc<FnName extends keyof Database['public']['Functions']>(
    functionName: FnName,
    args?: Database['public']['Functions'][FnName]['Args'],
    options?: { useServiceRole?: boolean },
  ): Promise<Database['public']['Functions'][FnName]['Returns']> {
    const client = options?.useServiceRole
      ? this.getServiceRoleClient()
      : this.supabaseClient;

    const { data, error } = await client.rpc(functionName as any, args as any);

    if (error) {
      this.logger.debug(`RPC call failed: ${String(functionName)}`, error);
      throw error;
    }

    return data as Database['public']['Functions'][FnName]['Returns'];
  }
}
