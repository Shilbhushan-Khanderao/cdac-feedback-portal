/**
 * Centralized Application Errors & Formatters for C-DAC Feedback Portal
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST'): AppError {
  return new AppError(400, message, code);
}

export function unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED'): AppError {
  return new AppError(401, message, code);
}

export function forbidden(message = 'Access denied', code = 'FORBIDDEN'): AppError {
  return new AppError(403, message, code);
}

export function notFound(message = 'Resource not found', code = 'NOT_FOUND'): AppError {
  return new AppError(404, message, code);
}

export function conflict(message = 'Resource conflict', code = 'CONFLICT'): AppError {
  return new AppError(409, message, code);
}

/**
 * Sanitizes raw PostgreSQL errors into user-safe error messages,
 * ensuring no database schema details, constraints, or table internal names leak.
 */
export function sanitizeDbError(err: any): string {
  if (!err) return 'Database operation failed.';
  if (err.code === '23505') return 'A record with these unique details already exists.';
  if (err.code === '23503') return 'Operation violates a data dependency constraint.';
  if (err.code === '22P02') return 'Invalid parameter format.';
  if (err.code === 'P0001' && err.message) {
    // Custom RAISE EXCEPTION from stored procedures (e.g., submit_feedback)
    return err.message;
  }
  return 'Database operation failed.';
}

/**
 * Maps a DB/driver error to a client-safe AppError. Unknown errors are returned
 * untouched so the global handler answers a generic 500 (never err.message).
 */
export function mapDbError(err: any): Error {
  if (err instanceof AppError) return err;
  switch (err?.code) {
    case 'P0001': // our own RAISE EXCEPTION texts are written for users
      return new AppError(400, err.message || 'Request rejected', 'REJECTED');
    case '42501': // RLS / privilege violation
      return forbidden('Access denied');
    case '23505':
      return conflict('A record with these unique details already exists.');
    case '23503':
      return conflict('Operation violates a data dependency constraint.');
    case '23514':
    case '23502':
    case '22P02':
    case '22007':
    case '22001':
      return badRequest('Invalid data.');
    default:
      return err;
  }
}
