import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { Logger } from '../common/logger';
import { ConfigService } from '../config/config.service';
import { Database } from '../types/database.types';

export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private supabaseClient!: SupabaseClient<Database>;

  /* istanbul ignore next -- DI constructor */
  constructor(private configService: ConfigService) {
    this.initializeSupabase();
  }

  private initializeSupabase() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseKey) {
      this.logger.error('Supabase URL and SERVICE_ROLE_KEY must be provided');
      throw new Error('Missing Supabase configuration');
    }

    this.supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.logger.log('Supabase client initialized successfully');
  }

  /**
   * Get the Supabase client instance.
   *
   * There is exactly one client, and it holds the service-role key. account-engine
   * is the only writer to these tables and every caller reaches it through an
   * authenticated HTTP route, so authorization is enforced in the route layer —
   * not by Postgres roles. No anon/`authenticated` path exists: those roles have
   * no grants on `public` (see `supabase/migrations/*_lock_down_public_anon_access.sql`).
   */
  getClient(): SupabaseClient<Database> {
    return this.supabaseClient;
  }

  /**
   * Execute a Supabase RPC (Remote Procedure Call) function with strict type safety.
   *
   * @param functionName - The name of the database function to call (typed and validated)
   * @param args - Arguments to pass to the function (type inferred from function definition)
   * @returns Promise resolving to the function result (type inferred from function definition)
   */
  async rpc<FnName extends keyof Database['public']['Functions']>(
    functionName: FnName,
    args?: Database['public']['Functions'][FnName]['Args'],
  ): Promise<Database['public']['Functions'][FnName]['Returns']> {
    const { data, error } = await this.supabaseClient.rpc(
      functionName as any,
      args as any,
    );

    if (error) {
      this.logger.debug(`RPC call failed: ${String(functionName)}`, error);
      throw error;
    }

    return data as Database['public']['Functions'][FnName]['Returns'];
  }
}
