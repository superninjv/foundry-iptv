// src/app/api/auth/[...nextauth]/route.ts
// NextAuth v5 catch-all route handler.

import { handlers } from '@/lib/auth/config';

export const { GET, POST } = handlers;
