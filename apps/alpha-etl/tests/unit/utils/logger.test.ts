import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import winston from "winston";

// Mock winston to track calls and transports
vi.mock("winston", async (importOriginal) => {
  await importOriginal<typeof winston>();

  const mockFileTransport = vi.fn();
  const mockConsoleTransport = vi.fn();
  const mockLoggerAdd = vi.fn();
  const mockLogger = {
    add: mockLoggerAdd,
    level: "info",
    transports: [],
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    default: {
      createLogger: vi.fn(() => mockLogger),
      transports: {
        File: mockFileTransport,
        Console: mockConsoleTransport,
      },
      format: {
        combine: vi.fn(() => "combined-format"),
        timestamp: vi.fn(() => "timestamp-format"),
        errors: vi.fn(() => "errors-format"),
        json: vi.fn(() => "json-format"),
        colorize: vi.fn(() => "colorize-format"),
        printf: vi.fn((fn) => {
          // Store the callback so we can test it
          (mockLogger as unknown).printfCallback = fn;
          return "printf-format";
        }),
      },
    },
    createLogger: vi.fn(() => mockLogger),
    transports: {
      File: mockFileTransport,
      Console: mockConsoleTransport,
    },
    format: {
      combine: vi.fn(() => "combined-format"),
      timestamp: vi.fn(() => "timestamp-format"),
      errors: vi.fn(() => "errors-format"),
      json: vi.fn(() => "json-format"),
      colorize: vi.fn(() => "colorize-format"),
      printf: vi.fn((fn) => {
        // Store the callback so we can test it
        (mockLogger as unknown).printfCallback = fn;
        return "printf-format";
      }),
    },
  };
});

// Mock environment config that responds to NODE_ENV changes
vi.mock("../../../src/config/environment.js", () => ({
  get env() {
    return {
      LOG_LEVEL: "info",
      NODE_ENV: process.env.NODE_ENV || "development",
    };
  },
}));

describe("Logger Utility", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should format messages correctly in development mode", async () => {
    process.env.NODE_ENV = "development";

    await import("../../../src/utils/logger");

    // Get the mock logger to access the captured printf callback
    const mockCreateLogger = vi.mocked(winston.createLogger);
    const mockLogger = mockCreateLogger.mock.results[0].value;
    const printfCallback = (mockLogger as unknown).printfCallback;

    expect(printfCallback).toBeDefined();
    expect(typeof printfCallback).toBe("function");

    // Test the callback with metadata
    const logWithMeta = {
      timestamp: "2023-01-01 12:00:00",
      level: "info",
      message: "Test message",
      service: "test-service",
      userId: "123",
    };

    const formattedWithMeta = printfCallback(logWithMeta);
    expect(formattedWithMeta).toContain(
      "2023-01-01 12:00:00 [info]: Test message",
    );
    expect(formattedWithMeta).toContain('"service": "test-service"');
    expect(formattedWithMeta).toContain('"userId": "123"');

    // Test the callback without metadata
    const logWithoutMeta = {
      timestamp: "2023-01-01 12:00:00",
      level: "error",
      message: "Error message",
    };

    const formattedWithoutMeta = printfCallback(logWithoutMeta);
    expect(formattedWithoutMeta).toBe(
      "2023-01-01 12:00:00 [error]: Error message ",
    );
  });

  it("should create logger with console transport in development mode", async () => {
    process.env.NODE_ENV = "development";

    // Import the logger module
    await import("../../../src/utils/logger");

    // Verify winston.createLogger was called
    expect(winston.createLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        defaultMeta: { service: "alpha-etl" },
        transports: [expect.any(Object)], // Console transport
        exitOnError: false,
      }),
    );

    // Verify Console transport was created
    expect(winston.transports.Console).toHaveBeenCalledWith({
      handleExceptions: true,
      handleRejections: true,
    });

    // Verify development format functions were called
    expect(winston.format.colorize).toHaveBeenCalled();
    expect(winston.format.printf).toHaveBeenCalled();

    // Get the mock logger instance to verify no file transports were added
    const mockCreateLogger = vi.mocked(winston.createLogger);
    const loggerInstance = mockCreateLogger.mock.results[0].value;
    expect(loggerInstance.add).not.toHaveBeenCalled();
  });

  it("should create logger with console transport in test mode", async () => {
    process.env.NODE_ENV = "test";

    await import("../../../src/utils/logger");

    // Verify winston.createLogger was called
    expect(winston.createLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        defaultMeta: { service: "alpha-etl" },
        transports: [expect.any(Object)],
        exitOnError: false,
      }),
    );

    // Verify Console transport was created
    expect(winston.transports.Console).toHaveBeenCalledWith({
      handleExceptions: true,
      handleRejections: true,
    });

    // Verify non-development format functions were called (json format)
    expect(winston.format.json).toHaveBeenCalled();
    expect(winston.format.errors).toHaveBeenCalled();

    // Get the mock logger instance to verify no file transports were added
    const mockCreateLogger = vi.mocked(winston.createLogger);
    const loggerInstance = mockCreateLogger.mock.results[0].value;
    expect(loggerInstance.add).not.toHaveBeenCalled();
  });

  it("should add file transports when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";

    await import("../../../src/utils/logger");

    // Verify winston.createLogger was called with JSON format for production
    expect(winston.createLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        defaultMeta: { service: "alpha-etl" },
        transports: [expect.any(Object)],
        exitOnError: false,
      }),
    );

    // Verify Console transport was created
    expect(winston.transports.Console).toHaveBeenCalledWith({
      handleExceptions: true,
      handleRejections: true,
    });

    // Verify production format functions were called (json format)
    expect(winston.format.json).toHaveBeenCalled();
    expect(winston.format.errors).toHaveBeenCalled();

    // Get the mock logger instance to verify file transports were added
    const mockCreateLogger = vi.mocked(winston.createLogger);
    const loggerInstance = mockCreateLogger.mock.results[0].value;
    expect(loggerInstance.add).toHaveBeenCalledTimes(2);

    // Verify error log transport
    expect(winston.transports.File).toHaveBeenCalledWith({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    });

    // Verify combined log transport
    expect(winston.transports.File).toHaveBeenCalledWith({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
    });
  });

  it("should use different formats for development vs production", async () => {
    // Test development format
    process.env.NODE_ENV = "development";
    vi.resetModules();
    await import("../../../src/utils/logger");

    expect(winston.format.combine).toHaveBeenCalled();
    expect(winston.format.colorize).toHaveBeenCalled();
    expect(winston.format.printf).toHaveBeenCalled();

    vi.clearAllMocks();
    vi.resetModules();

    // Test production format
    process.env.NODE_ENV = "production";
    await import("../../../src/utils/logger");

    expect(winston.format.combine).toHaveBeenCalled();
    expect(winston.format.json).toHaveBeenCalled();
    expect(winston.format.errors).toHaveBeenCalled();
  });

  it("should export a logger instance", async () => {
    process.env.NODE_ENV = "development";

    const { logger } = await import("../../../src/utils/logger");

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });
});
