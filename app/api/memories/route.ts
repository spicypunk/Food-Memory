// app/api/memories/route.ts
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

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
        photo_taken_at
      FROM food_memories
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return NextResponse.json(memories);
  } catch (error) {
    console.error('Fetch memories error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}
