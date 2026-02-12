// app/api/memories/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { neon } from '@neondatabase/serverless';

// Disable caching for this route
export const dynamic = 'force-dynamic';

async function lookupGoogleMapsUrl(
  restaurantName: string,
  latitude: number,
  longitude: number
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const query = encodeURIComponent(restaurantName);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&location=${latitude},${longitude}&radius=5000&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const place = data.results[0];
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || restaurantName)}&query_place_id=${place.place_id}`;
    }
    return null;
  } catch (err) {
    console.error('Google Places lookup failed:', err);
    return null;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    const { friend_tags, personal_note, dish_name, restaurant_name } = body;

    const sql = neon(process.env.DATABASE_URL!);

    // If restaurant_name is being updated, look up new Google Maps URL
    if (restaurant_name !== undefined) {
      // Fetch the memory's coordinates for the Places lookup
      const existing = await sql`
        SELECT latitude, longitude FROM food_memories WHERE id = ${memoryId}
      `;

      if (existing.length === 0) {
        return NextResponse.json(
          { error: 'Memory not found' },
          { status: 404 }
        );
      }

      const lat = Number(existing[0].latitude);
      const lng = Number(existing[0].longitude);

      let googleMapsUrl: string | null = null;
      if (restaurant_name) {
        googleMapsUrl = await lookupGoogleMapsUrl(restaurant_name, lat, lng);
      }

      const result = await sql`
        UPDATE food_memories
        SET
          friend_tags = ${friend_tags ?? null},
          personal_note = ${personal_note ?? null},
          dish_name = ${dish_name ?? null},
          restaurant_name = ${restaurant_name || null},
          google_maps_url = ${googleMapsUrl}
        WHERE id = ${memoryId}
        RETURNING
          id, original_image_url, cropped_image_url, latitude, longitude,
          created_at, dish_name, restaurant_name, photo_taken_at,
          friend_tags, personal_note, google_maps_url, neighborhood
      `;

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'Memory not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(result[0]);
    }

    // Default path: no restaurant_name change
    const result = await sql`
      UPDATE food_memories
      SET
        friend_tags = ${friend_tags ?? null},
        personal_note = ${personal_note ?? null},
        dish_name = ${dish_name ?? null}
      WHERE id = ${memoryId}
      RETURNING
        id, original_image_url, cropped_image_url, latitude, longitude,
        created_at, dish_name, restaurant_name, photo_taken_at,
        friend_tags, personal_note, google_maps_url, neighborhood
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
