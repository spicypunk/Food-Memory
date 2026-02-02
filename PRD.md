# Food Memory - Product Requirements Document

## Overview

Food Memory is a mobile-friendly web application that allows users to upload food photos and display them as circular icons on a map at the location where the photo was taken.

## Core Functionality

### 1. Photo Upload

**Trigger:** User taps the floating action button (black circle with white "+" icon) in the lower-right corner of the screen.

**Flow:**
1. User selects a photo from their device
2. App extracts GPS coordinates from the photo's EXIF metadata
3. App uploads the original image to the server
4. Server removes the background from the food image
5. Server stores both original and cropped images in Vercel Blob storage
6. Server saves the memory record to the database
7. App displays the new memory on the map

**Error Handling:**
- If the photo has no GPS data, display error: "No location data found in this photo. Make sure location services were enabled when you took it."
- If upload fails, display the error message to the user

### 2. Map Display

**Specifications:**
- Full-screen interactive map using Leaflet
- Light/white theme (CARTO light tiles)
- Map centers on the most recent memory on initial load
- Default center: New York City (40.7128, -74.006) if no memories exist

### 3. Food Markers

**Specifications:**
- Each memory displays as a 56x56 pixel circular marker
- Marker shows the background-removed food image
- White border (3px) with drop shadow
- Tapping a marker opens a popup with:
  - Larger view of the food image (120x120px)
  - Date of the memory

### 4. Memory Detail Sheet

**Trigger:** User taps a marker on the map.

**Display:**
- Bottom sheet slides up from the bottom of the screen
- Shows the food image (80x80px)
- Shows the full date (weekday, month, day, year)
- Shows coordinates (latitude, longitude to 4 decimal places)
- Close button (X) in the top-right corner
- Sheet does not overlap with the floating action button

### 5. Upload Status Indicator

**Display:**
- Small black tooltip appears above the floating action button during upload
- Shows current status: "Reading location...", "Processing...", "Saving..."
- Floating action button shows a spinner while uploading

## User Interface

### Header
- Fixed position at top of screen
- Semi-transparent dark background with blur effect
- App title: "Food Memory"
- Subtitle: "[N] memories mapped" showing total count

### Floating Action Button
- Position: Fixed, bottom-right corner (24px from edges)
- Size: 56x56px circular
- Style: Black background, white border, white "+" icon
- Disabled state: Gray background with spinner during upload

### Color Scheme
- Header/sheets: Dark theme (rgba(26, 26, 46, 0.85))
- Map: Light/white theme
- Action button: Black and white
- Error messages: Red background (#e94560)

## Technical Architecture

### Frontend
- Next.js 14 (App Router)
- React 18
- Leaflet + react-leaflet for mapping
- exifr for EXIF GPS extraction
- Dynamic import with SSR disabled for Leaflet components

### Backend
- Next.js API Routes
- Neon PostgreSQL (serverless) for data storage
- Vercel Blob for image storage

### Database Schema

```sql
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
```

### API Endpoints

**GET /api/memories**
- Returns up to 100 most recent memories
- Ordered by created_at DESC

**POST /api/upload**
- Accepts: multipart/form-data
  - `original`: Image file
  - `latitude`: String (decimal)
  - `longitude`: String (decimal)
- Returns: Created memory object with id, URLs, coordinates, and timestamp

## Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | Neon PostgreSQL connection string |
| BLOB_READ_WRITE_TOKEN | Vercel Blob storage token |

## Constraints

- Photos must contain EXIF GPS metadata to be uploaded
- Maximum 100 memories displayed on map at once
- Images must be in a format supported by the browser's file input (image/*)
