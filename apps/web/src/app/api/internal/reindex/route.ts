import { NextResponse } from 'next/server';
import { PulseIndexer } from '@/lib/indexer';

export const maxDuration = 60; // Vercel function timeout increase
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Allow local dev
      if (process.env.NODE_ENV !== 'development') {
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    const indexer = new PulseIndexer();
    const result = await indexer.indexEvents();

    return NextResponse.json({ 
      success: true, 
      ...result 
    });
  } catch (error) {
    console.error('Indexing failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
