import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasPublishable: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    hasSecret: !!process.env.CLERK_SECRET_KEY,
    publishableKeyPrefix: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY 
      ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.substring(0, 10) + '...' 
      : 'not set',
    secretKeyPrefix: process.env.CLERK_SECRET_KEY 
      ? process.env.CLERK_SECRET_KEY.substring(0, 10) + '...' 
      : 'not set',
    domain: process.env.NEXT_PUBLIC_CLERK_DOMAIN || 'not set (defaults to estateinspections.co.uk)',
  });
}
