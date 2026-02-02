// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const original = formData.get('original') as File;
    const cropped = formData.get('cropped') as File;
    const latitude = parseFloat(formData.get('latitude') as string);
    const longitude = parseFloat(formData.get('longitude') as string);

    if (!original || !cropped || isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Missing image or location data' },
        { status: 400 }
      );
    }

    // Upload both images to Vercel Blob
    const [originalBlob, croppedBlob] = await Promise.all([
      put(`originals/${Date.now()}-${original.name}`, original, { access: 'public' }),
      put(`cropped/${Date.now()}.png`, cropped, { access: 'public' }),
    ]);

    // Save to Neon database
    const result = await sql`
      INSERT INTO food_memories (
        original_image_url,
        cropped_image_url,
        latitude,
        longitude,
        created_at
      ) VALUES (
        ${originalBlob.url},
        ${croppedBlob.url},
        ${latitude},
        ${longitude},
        NOW()
      )
      RETURNING id, original_image_url, cropped_image_url, latitude, longitude, created_at
    `;

    return NextResponse.json(result[0]);

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
