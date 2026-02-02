# 🍜 Food Memory

Map your food adventures around the world. Upload a food photo, automatically remove the background to create a clean icon, and pin it on the map based on where you took the photo.

![Food Memory Preview](preview.png)

## Features

- **EXIF GPS extraction** - Automatically reads location data from your photos
- **AI background removal** - Uses Replicate's rembg to create clean food icons
- **Interactive map** - Beautiful dark-themed Leaflet map with custom markers
- **Mobile-first** - Works great on iPhone/Android for on-the-go uploads

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Map**: Leaflet + react-leaflet
- **Background Removal**: [@imgly/background-removal](https://github.com/imgly/background-removal-js) (runs client-side via WebAssembly)
- **Database**: Neon PostgreSQL (serverless)
- **File Storage**: Vercel Blob
- **Deployment**: Vercel

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd food-memory
npm install
```

### 2. Set up Neon database

1. Create a free account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy your connection string from the dashboard
4. Run the schema in the Neon SQL editor:

```sql
-- Copy contents of schema.sql
CREATE TABLE food_memories (
  id SERIAL PRIMARY KEY,
  original_image_url TEXT NOT NULL,
  cropped_image_url TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  name VARCHAR(255),
  notes TEXT
);

CREATE INDEX idx_food_memories_location ON food_memories (latitude, longitude);
CREATE INDEX idx_food_memories_created ON food_memories (created_at DESC);
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in your values:
- `DATABASE_URL` - Neon connection string

### 4. Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Add Vercel Blob storage:
   - Go to Storage tab → Create Database → Blob
   - This auto-configures `BLOB_READ_WRITE_TOKEN`

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage Tips

### Photos must have location data

For EXIF GPS data to work, make sure:
- Location Services is enabled for your Camera app
- You're uploading **original** photos (not screenshots or shared via messaging apps)
- The photo was taken with your phone's camera (not downloaded from the web)

### Works best with

- Fresh food photos taken at restaurants/cafes
- Clear shots of plated dishes (background removal works better)
- Photos taken in good lighting

## Cost Estimates

All services have generous free tiers:

| Service | Free Tier | ~Cost After |
|---------|-----------|-------------|
| Neon | 500MB storage | $0.25/GB |
| Vercel Blob | 1GB storage | $0.03/GB |
| Vercel Hosting | 100GB bandwidth | $0.15/GB |
| Background Removal | Unlimited (client-side) | $0 |

For personal use, you'll likely stay within free tiers. Background removal runs entirely in your browser using WebAssembly, so there's no API cost.

## Future Ideas

- [ ] Add food name/notes to memories
- [ ] Reverse geocode to show restaurant/neighborhood names
- [ ] Search/filter by date range
- [ ] Share individual memories or full map
- [ ] AI-powered food identification
- [ ] Export to Instagram-style recap

## License

MIT
# Food-Memory
