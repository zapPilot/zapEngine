import { AppError, HttpStatus } from '@common/http';

/**
 * Custom exception for wrapping service layer errors with context.
 * Preserves the original error for debugging while providing user-friendly messages.
 */
export class ServiceLayerException extends AppError {
  public readonly cause?: Error;
  public readonly statusCode: HttpStatus;

  /**
   * @param message A user-friendly message that can be sent in the response
   * @param statusCode The HTTP status code to be returned (default: 500)
   * @param cause The original error object, preserved for logging
   */
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    cause?: Error,
  ) {
    super(message, statusCode, cause);
    this.name = 'ServiceLayerException';
    this.cause = cause;
    this.statusCode = statusCode;
  }
}
