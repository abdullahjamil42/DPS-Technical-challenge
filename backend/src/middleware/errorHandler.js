/**
 * Centralized error handler middleware.
 *
 * All errors in the application are funnelled here via next(err).
 * This ensures consistent error response shapes across the API.
 *
 * Error shape:
 * {
 *   "error":   "<SCREAMING_SNAKE_CASE error code>",
 *   "message": "<human-readable description>",
 *   ...additionalFields
 * }
 */

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Operational errors we deliberately threw with known codes
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.meta || {}),
    });
  }

  // Unexpected / programmer errors — don't leak internals
  console.error('[Unhandled Error]', err);
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  });
}

/**
 * Factory for operational errors (errors we expect and handle intentionally).
 *
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Screaming snake case error identifier
 * @param {string} message - Human-readable message
 * @param {object} [meta] - Optional additional fields to include in the response
 */
export function createApiError(statusCode, code, message, meta = {}) {
  const error = new Error(message);
  error.isOperational = true;
  error.statusCode = statusCode;
  error.code = code;
  error.meta = meta;
  return error;
}
