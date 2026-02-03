// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

async function removeBackgroundWithRemoveBg(imageBuffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  const types = ['auto', 'product']; // Try auto first, then product

  for (const type of types) {
    try {
      const formData = new FormData();
      formData.append('image_file', new Blob([imageBuffer]), 'image.jpg');
      formData.append('size', 'auto');
      formData.append('type', type);

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': process.env.REMOVE_BG_API_KEY!,
        },
        body: formData,
      });

      if (response.ok) {
        return await response.arrayBuffer();
      }

      const error = await response.text();
      console.log(`Remove.bg failed with type=${type}:`, error);
      // Continue to next type
    } catch (error) {
      console.error(`Remove.bg error with type=${type}:`, error);
      // Continue to next type
    }
  }

  // All attempts failed, return null to use original image
  console.log('All background removal attempts failed, using original image');
  return null;
}

async function identifyDishAndRestaurant(
  imageBuffer: ArrayBuffer,
  restaurants: string[]
): Promise<{ dishName: string | null; restaurantName: string | null }> {
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set, skipping dish identification');
    return { dishName: null, restaurantName: restaurants[0] || null };
  }

  try {
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // If no restaurants nearby, just identify the dish
    if (restaurants.length === 0) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Identify this dish in 2-4 words. Be specific (e.g. "Shrimp Tempura" not "Japanese food"). Just return the dish name, nothing else.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 50,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI API error:', error);
        return { dishName: null, restaurantName: null };
      }

      const data = await response.json();
      const dishName = data.choices?.[0]?.message?.content?.trim() || null;
      return { dishName, restaurantName: null };
    }

    // With restaurants, ask for both dish and restaurant match
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are looking at a food photo taken at one of these restaurants:
${restaurants.join(', ')}

1. Identify the dish in 2-4 words (e.g., "Shrimp Tempura")
2. Pick which restaurant this dish most likely came from based on the cuisine type

Respond in JSON only: {"dish": "...", "restaurant": "..."}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return { dishName: null, restaurantName: restaurants[0] || null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return { dishName: null, restaurantName: restaurants[0] || null };
    }

    // Parse JSON response (strip markdown code blocks if present)
    try {
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonContent);
      return {
        dishName: parsed.dish || null,
        restaurantName: parsed.restaurant || restaurants[0] || null,
      };
    } catch {
      // If JSON parsing fails, try to extract dish name and use first restaurant
      console.error('Failed to parse OpenAI response as JSON:', content);
      return { dishName: content, restaurantName: restaurants[0] || null };
    }
  } catch (error) {
    console.error('Error identifying dish and restaurant:', error);
    return { dishName: null, restaurantName: restaurants[0] || null };
  }
}

async function findNearbyRestaurants(latitude: number, longitude: number): Promise<string[]> {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('GOOGLE_PLACES_API_KEY not set, skipping restaurant lookup');
    return [];
  }

  try {
    // Use Google Places Nearby Search API
    const types = 'restaurant|cafe|bakery|bar';
    const radius = 50; // 50 meters
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${types}&key=${process.env.GOOGLE_PLACES_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.error('Google Places API error:', error);
      return [];
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      // Return all restaurant names for AI matching
      return data.results.map((r: { name: string }) => r.name);
    }

    return [];
  } catch (error) {
    console.error('Error finding restaurants:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const original = formData.get('original') as File;
    const latitude = parseFloat(formData.get('latitude') as string);
    const longitude = parseFloat(formData.get('longitude') as string);
    const photoTakenAt = formData.get('photoTakenAt') as string | null;

    if (!original || isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Missing image or location data' },
        { status: 400 }
      );
    }

    // Get image buffer once for multiple uses
    const imageArrayBuffer = await original.arrayBuffer();

    // Step 1: Get restaurants and start background removal in parallel
    const [restaurants, bgRemovedBuffer] = await Promise.all([
      findNearbyRestaurants(latitude, longitude),
      removeBackgroundWithRemoveBg(imageArrayBuffer),
    ]);

    // Step 2: Identify dish and match restaurant (needs restaurant list first)
    const { dishName, restaurantName } = await identifyDishAndRestaurant(
      imageArrayBuffer,
      restaurants
    );

    // Use background-removed image if available, otherwise fall back to original
    const croppedBuffer = bgRemovedBuffer || imageArrayBuffer;
    const croppedExtension = bgRemovedBuffer ? 'png' : 'jpg';

    // Upload both images to Vercel Blob
    const [originalBlob, croppedBlob] = await Promise.all([
      put(`originals/${Date.now()}-${original.name}`, original, { access: 'public' }),
      put(`cropped/${Date.now()}.${croppedExtension}`, Buffer.from(croppedBuffer), { access: 'public' }),
    ]);

    // Save to Neon database
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`
      INSERT INTO food_memories (
        original_image_url,
        cropped_image_url,
        latitude,
        longitude,
        dish_name,
        restaurant_name,
        photo_taken_at,
        created_at
      ) VALUES (
        ${originalBlob.url},
        ${croppedBlob.url},
        ${latitude},
        ${longitude},
        ${dishName},
        ${restaurantName},
        ${photoTakenAt ? new Date(photoTakenAt).toISOString() : null},
        NOW()
      )
      RETURNING id, original_image_url, cropped_image_url, latitude, longitude, dish_name, restaurant_name, photo_taken_at, created_at
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
