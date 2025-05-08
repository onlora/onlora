import { createAuthClient } from 'better-auth/react'

// The baseURL should be the base URL of your backend server where the
// /api/auth/* routes are hosted.
const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export const authClient = createAuthClient({
  // If your auth routes are at http://localhost:8080/api/auth/*,
  // and your NEXT_PUBLIC_API_URL is http://localhost:8080/api,
  // then the baseURL for better-auth client should point to the root of the backend server,
  // as it will append its own /api/auth path or use what's configured server-side.
  // However, the better-auth docs examples often show baseURL: "http://localhost:3000"
  // if the auth server is on the same domain as the app, implying it constructs paths correctly.
  // Let's assume the /api/auth path is relative to the API_BASE_URL.
  // If API_BASE_URL is 'http://localhost:8080/api', then auth routes are at '/auth' relative to that.
  // Or, more simply, if better-auth server side is at /api/auth/*, and our frontend calls backend at /api/
  // we need to ensure the client hits the correct base for its /api/auth calls.
  // The better-auth examples use `baseURL: "http://localhost:3000"` when client and server are on the same domain.
  // If client is on 3000 and API (including /api/auth/*) is on 8080, then baseURL should be http://localhost:8080
  baseURL: backendUrl.replace('/api', ''), // Assuming NEXT_PUBLIC_API_URL might be http://host/api
})

// Optionally, re-export commonly used methods/hooks for easier import elsewhere
export const { signIn, signUp, signOut, useSession, getSession } = authClient
