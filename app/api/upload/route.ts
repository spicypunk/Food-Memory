// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

async function removeBackgroundWithRemoveBg(imageBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append('image_file', new Blob([imageBuffer]), 'image.jpg');
  formData.append('size', 'auto');

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.REMOVE_BG_API_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Remove.bg API error: ${error}`);
  }

  return await response.arrayBuffer();
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const original = formData.get('original') as File;
    const latitude = parseFloat(formData.get('latitude') as string);
    const longitude = parseFloat(formData.get('longitude') as string);

    if (!original || isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Missing image or location data' },
        { status: 400 }
      );
    }

    // Remove background using Remove.bg API
    const imageArrayBuffer = await original.arrayBuffer();
    const croppedArrayBuffer = await removeBackgroundWithRemoveBg(imageArrayBuffer);

    // Upload both images to Vercel Blob
    const [originalBlob, croppedBlob] = await Promise.all([
      put(`originals/${Date.now()}-${original.name}`, original, { access: 'public' }),
      put(`cropped/${Date.now()}.png`, Buffer.from(croppedArrayBuffer), { access: 'public' }),
    ]);

    // Save to Neon database
    const sql = neon(process.env.DATABASE_URL!);
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
