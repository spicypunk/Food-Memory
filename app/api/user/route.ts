// app/api/user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!, {
      fetchOptions: { cache: 'no-store' },
    });

    const rows = await sql`
      SELECT display_name FROM users WHERE user_id = ${userId}
    `;

    if (rows.length === 0) {
      return NextResponse.json(null);
    }

    return NextResponse.json({ display_name: rows[0].display_name });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { display_name } = await request.json();

    if (!display_name || typeof display_name !== 'string' || display_name.trim().length === 0) {
      return NextResponse.json(
        { error: 'display_name is required' },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!, {
      fetchOptions: { cache: 'no-store' },
    });

    const result = await sql`
      INSERT INTO users (user_id, display_name)
      VALUES (${userId}, ${display_name.trim()})
      ON CONFLICT (user_id)
      DO UPDATE SET display_name = ${display_name.trim()}
      RETURNING display_name
    `;

    return NextResponse.json({ display_name: result[0].display_name });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
