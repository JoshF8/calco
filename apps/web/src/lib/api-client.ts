// API client for the calco backend.
//
// `apiClient` is a fully-typed wrapper around fetch generated from the
// OpenAPI spec in src/lib/types.gen.ts. Regenerate the types with:
//
//   task web:gen-types
//
// (requires the server running on the configured URL).
import createClient from 'openapi-fetch';
import type { paths } from './types.gen';

const baseUrl: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export const apiClient = createClient<paths>({ baseUrl });
