import 'package:ai_podcast_mobile/services/supabase_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SupabaseService - Uninitialized State', () {
    test(
      'client should return null gracefully when Supabase is not initialized',
      () {
        final service = SupabaseService();
        expect(service.client, isNull);
      },
    );

    test(
      'isConfigured should return false when Supabase is not initialized',
      () {
        final service = SupabaseService();
        expect(service.isConfigured, isFalse);
      },
    );
  });
}
