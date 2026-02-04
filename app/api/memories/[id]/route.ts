// app/api/memories/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Disable caching for this route
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const memoryId = parseInt(id, 10);

    if (isNaN(memoryId)) {
      return NextResponse.json(
        { error: 'Invalid memory ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { friend_tags, personal_note } = body;

    const sql = neon(process.env.DATABASE_URL!);

    const result = await sql`
      UPDATE food_memories
      SET
        friend_tags = ${friend_tags ?? null},
        personal_note = ${personal_note ?? null}
      WHERE id = ${memoryId}
      RETURNING
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
        personal_note
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Update memory error:', error);
    return NextResponse.json(
      { error: 'Failed to update memory' },
      { status: 500 }
    );
  }
}
