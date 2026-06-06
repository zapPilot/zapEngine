import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  SupabaseClient? get client {
    try {
      Supabase.instance.client;
      return Supabase.instance.client;
    } catch (_) {
      return null;
    }
  }

  bool get isConfigured => client != null;
}
