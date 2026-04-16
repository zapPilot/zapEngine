import { validateRegimeHistoryResponse } from "@/schemas/api/regimeHistorySchemas";

describe("Regime History Schema Validation", () => {
  // Valid V2 API Response Mock
  const validV2Response = {
    current: {
      id: "942dbf28-0a12-496e-835a-af69c82b6ab5",
      to_regime: "f",
      from_regime: "ef",
      sentiment_value: 28,
      transitioned_at: "2025-12-27T02:08:10Z",
      duration_hours: null,
    },
    previous: {
      id: "c93c4efb-c5f4-4f7b-8ce9-a1584c93c080",
      to_regime: "ef",
      from_regime: "f",
      sentiment_value: 23,
      transitioned_at: "2025-12-27T00:00:00Z",
      duration_hours: null,
    },
    direction: "fromLeft",
    duration_in_current: {
      hours: 50.35,
      days: 2.1,
      human_readable: "2 days, 2 hours",
    },
    transitions: [
      {
        id: "942dbf28-0a12-496e-835a-af69c82b6ab5",
        to_regime: "f",
        from_regime: "ef",
        sentiment_value: 28,
        transitioned_at: "2025-12-27T02:08:10Z",
        duration_hours: null,
      },
      {
        id: "c93c4efb-c5f4-4f7b-8ce9-a1584c93c080",
        to_regime: "ef",
        from_regime: "f",
        sentiment_value: 23,
        transitioned_at: "2025-12-27T00:00:00Z",
        duration_hours: null,
      },
    ],
    timestamp: "2025-12-29T04:29:02.058653Z",
    cached: false,
  };

  it("should validate a correct V2 API response", () => {
    const result = validateRegimeHistoryResponse(validV2Response);
    expect(result).toEqual(validV2Response);
  });

  it("should fail if required V2 fields are missing (schema mismatch check)", () => {
    // Simulate V1-like response or incorrect field names
    const invalidResponse = {
      current: {
        regime_id: "123", // Wrong field name
        regime: "f", // Wrong field name
        timestamp: "2025-12-27T02:08:10Z", // Wrong field name
      },
      // ... rest omitted
    };

    expect(() => validateRegimeHistoryResponse(invalidResponse)).toThrow();
  });

  it("should validate duration info correctly", () => {
    const durationInfo = {
      hours: 24,
      days: 1,
      human_readable: "1 day",
    };

    const responseWithDuration = {
      ...validV2Response,
      duration_in_current: durationInfo,
    };

    const result = validateRegimeHistoryResponse(responseWithDuration);
    expect(result.duration_in_current).toEqual(durationInfo);
  });

  it("should handle null previous regime", () => {
    const responseNoHistory = {
      ...validV2Response,
      previous: null,
    };

    const result = validateRegimeHistoryResponse(responseNoHistory);
    expect(result.previous).toBeNull();
  });

  it("should validate regime enum values", () => {
    const invalidRegimeResponse = {
      ...validV2Response,
      current: {
        ...validV2Response.current,
        to_regime: "invalid_regime", // Not in ['ef', 'f', 'n', 'g', 'eg']
      },
    };

    expect(() =>
      validateRegimeHistoryResponse(invalidRegimeResponse)
    ).toThrow();
  });
});
