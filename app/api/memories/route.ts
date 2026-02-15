// app/api/memories/route.ts
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Disable caching for this route
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const memories = await sql`
      SELECT
        id,
        original_image_url,
        cropped_image_url,
        latitude,
        longitude,
        created_at,
        dish_name,
        restaurant_name,
        photo_taken_at,
        friend_tags,
        personal_note,
        google_maps_url,
        neighborhood,
        borough
      FROM food_memories
      ORDER BY created_at DESC
      LIMIT 100
    `;

    // Debug: also get raw count to diagnose production data mismatch
    const countResult = await sql`SELECT COUNT(*) as total, MAX(id) as max_id FROM food_memories`;

    return NextResponse.json(memories, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-DB-Total': String(countResult[0].total),
        'X-DB-Max-Id': String(countResult[0].max_id),
        'X-Returned': String(memories.length),
      },
    });
  } catch (error) {
    console.error('Fetch memories error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}
