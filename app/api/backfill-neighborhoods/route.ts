// app/api/backfill-neighborhoods/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

async function reverseGeocodeNeighborhood(latitude: number, longitude: number): Promise<string | null> {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&result_type=neighborhood&key=${process.env.GOOGLE_PLACES_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return null;
    }

    for (const component of data.results[0].address_components || []) {
      if ((component.types as string[]).includes('neighborhood')) {
        return component.long_name;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const rows = await sql`
      SELECT id, latitude, longitude
      FROM food_memories
      WHERE neighborhood IS NULL
      ORDER BY id
    `;

    let updated = 0;

    for (const row of rows) {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      const neighborhood = await reverseGeocodeNeighborhood(lat, lon);

      if (neighborhood) {
        await sql`
          UPDATE food_memories
          SET neighborhood = ${neighborhood}
          WHERE id = ${row.id}
        `;
        updated++;
      }

      await delay(200);
    }

    return NextResponse.json({ total: rows.length, updated });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}
