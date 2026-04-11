// src/app/api/channels/categories/route.ts
import { NextResponse } from 'next/server';
import { getApiUser, unauthorized } from '@/lib/auth/session';
import { getCategories } from '@/lib/threadfin/client';

export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const categories = await getCategories();
  return NextResponse.json({ categories });
}
