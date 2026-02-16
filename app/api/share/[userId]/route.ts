// app/api/share/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const sql = neon(process.env.DATABASE_URL!, {
      fetchOptions: { cache: 'no-store' },
    });

    // Fetch user info and memories in parallel
    const [userRows, memories] = await Promise.all([
      sql`SELECT display_name FROM users WHERE user_id = ${userId}`,
      sql`
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
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 100
      `,
    ]);

    const user = userRows.length > 0
      ? { display_name: userRows[0].display_name }
      : null;

    return NextResponse.json(
      { user, memories },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Share fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared memories' },
      { status: 500 }
    );
  }
}
