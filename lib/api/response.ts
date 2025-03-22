/**
 * Utility functions for API responses
 */
import { NextResponse } from 'next/server'

/**
 * Standard headers for API responses
 */
export const defaultHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

/**
 * CORS headers for API responses
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mux-Signature',
}

/**
 * Creates a successful JSON response
 */
export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, {
    status: 200,
    headers: {
      ...defaultHeaders,
      ...init?.headers,
    },
    ...init,
  })
}

/**
 * Creates a successful JSON response with CORS headers
 */
export function corsJsonResponse<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, {
    status: 200,
    headers: {
      ...defaultHeaders,
      ...corsHeaders,
      ...init?.headers,
    },
    ...init,
  })
}

/**
 * Creates an error response
 */
export function errorResponse(
  message: string, 
  status = 500, 
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { 
      error: message,
      ...(details ? { details } : {}),
    },
    {
      status,
      headers: defaultHeaders,
    }
  )
}

/**
 * Creates an error response with CORS headers
 */
export function corsErrorResponse(
  message: string, 
  status = 500, 
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { 
      error: message,
      ...(details ? { details } : {}),
    },
    {
      status,
      headers: {
        ...defaultHeaders,
        ...corsHeaders,
      }
    }
  )
}

/**
 * Creates an unauthorized response (401)
 */
export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return errorResponse(message, 401)
}

/**
 * Creates a not found response (404)
 */
export function notFoundResponse(message = 'Not Found'): NextResponse {
  return errorResponse(message, 404)
}

/**
 * Creates a bad request response (400)
 */
export function badRequestResponse(message = 'Bad Request', details?: Record<string, unknown>): NextResponse {
  return errorResponse(message, 400, details)
}

/**
 * Creates an options response for CORS preflight requests
 */
export function corsOptionsResponse(): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}