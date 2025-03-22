/**
 * API validation helpers
 */
import { corsErrorResponse } from './response'

/**
 * Validates input against the provided schema
 * Returns the validated data or throws an error with the validation details
 */
export async function validateInput<T>(
  input: unknown,
  schema: { parse: (data: unknown) => T }
): Promise<T> {
  try {
    return schema.parse(input)
  } catch (error) {
    if (error instanceof Error && 'errors' in error) {
      const validationError = error as Error & { errors?: unknown[] }
      throw new ValidationError('Validation failed', { errors: validationError.errors || [] })
    }
    throw new ValidationError('Invalid input', { message: 'Schema validation failed' })
  }
}

/**
 * Helper to safely parse JSON from a request
 */
export async function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch (error) {
    console.error('Error parsing JSON body:', error)
    throw new ValidationError('Invalid JSON body', { message: 'Failed to parse request body as JSON' })
  }
}

/**
 * Custom validation error class with additional details
 */
export class ValidationError extends Error {
  details?: Record<string, unknown>
  
  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

/**
 * Middleware to handle input validation
 * Returns a function that takes the handler and input schema
 */
export function withValidation<T, R>(
  handler: (validData: T, request: Request) => Promise<R>,
  schema: { parse: (data: unknown) => T }
) {
  return async (request: Request) => {
    try {
      const data = await parseJsonBody(request)
      const validData = await validateInput(data, schema)
      return await handler(validData, request)
    } catch (error) {
      if (error instanceof ValidationError) {
        return corsErrorResponse('Validation error', 400, error.details)
      }
      throw error
    }
  }
}