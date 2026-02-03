-- Run this in your Neon SQL editor to create the table

CREATE TABLE food_memories (
  id SERIAL PRIMARY KEY,
  original_image_url TEXT NOT NULL,
  cropped_image_url TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Optional: add name/notes later
  name VARCHAR(255),
  notes TEXT,

  -- Auto-detected fields (added Feb 2026)
  dish_name VARCHAR(100),
  restaurant_name VARCHAR(255),
  photo_taken_at TIMESTAMP WITH TIME ZONE
);

-- Migration for existing tables:
-- ALTER TABLE food_memories ADD COLUMN dish_name VARCHAR(100);
-- ALTER TABLE food_memories ADD COLUMN restaurant_name VARCHAR(255);
-- ALTER TABLE food_memories ADD COLUMN photo_taken_at TIMESTAMP WITH TIME ZONE;

-- Index for faster geo queries if you want to add proximity search later
CREATE INDEX idx_food_memories_location ON food_memories (latitude, longitude);
CREATE INDEX idx_food_memories_created ON food_memories (created_at DESC);
