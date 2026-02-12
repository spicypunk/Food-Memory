'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserButton } from '@clerk/nextjs';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import exifr from 'exifr';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface FoodMemory {
  id: number;
  original_image_url: string;
  cropped_image_url: string;
  latitude: number;
  longitude: number;
  created_at: string;
  dish_name: string | null;
  restaurant_name: string | null;
  photo_taken_at: string | null;
  friend_tags: string[] | null;
  personal_note: string | null;
  google_maps_url: string | null;
  neighborhood: string | null;
}

// Custom food icon for Leaflet markers
const createFoodIcon = (imageUrl: string) => {
  return L.divIcon({
    className: 'food-marker',
    html: `
      <div style="
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 3px solid #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        overflow: hidden;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
      </div>
    `,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, 0],
  });
};

// Map controller for smooth fly animations
function MapController({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 14, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

// Map click handler to dismiss selected memory
function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({
    click: () => {
      onMapClick();
    },
  });
  return null;
}

// Haversine formula to calculate distance between two coordinates in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface DishGroup {
  key: string;
  restaurant_name: string | null;
  latitude: number;
  longitude: number;
  memories: FoodMemory[];
}

// Food marker with synced popup and swipe support for multiple dishes
function FoodMarker({
  group,
  selectedMemoryId,
  onSelectMemory,
  onOpenFullscreen
}: {
  group: DishGroup;
  selectedMemoryId: number | null;
  onSelectMemory: (memory: FoodMemory | null) => void;
  onOpenFullscreen: (images: string[], initialIndex: number) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const memories = group.memories;
  const currentMemory = memories[currentIndex];
  const hasMultiple = memories.length > 1;
  const isSelected = memories.some(m => m.id === selectedMemoryId);

  // Reset index when group changes or popup closes
  useEffect(() => {
    if (!isSelected) {
      setCurrentIndex(0);
    }
  }, [isSelected, group.key]);

  // Sync selected memory when swiping
  useEffect(() => {
    if (isSelected) {
      onSelectMemory(currentMemory);
    }
  }, [currentIndex, isSelected]);

  useEffect(() => {
    if (markerRef.current) {
      if (isSelected) {
        markerRef.current.openPopup();
      } else {
        markerRef.current.closePopup();
      }
    }
  }, [isSelected]);

  // Attach click handler directly to the marker's DOM element
  useEffect(() => {
    if (markerRef.current) {
      const el = markerRef.current.getElement();
      if (el) {
        const handleClick = (e: Event) => {
          e.stopPropagation();
          if (isSelected) {
            onSelectMemory(null);
          } else {
            setCurrentIndex(0);
            onSelectMemory(memories[0]);
          }
        };
        el.addEventListener('click', handleClick);
        return () => el.removeEventListener('click', handleClick);
      }
    }
  }, [isSelected, memories, onSelectMemory]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) { // 50px threshold
      if (diff > 0 && currentIndex < memories.length - 1) {
        // Swipe left - go to next
        setCurrentIndex(currentIndex + 1);
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe right - go to prev
        setCurrentIndex(currentIndex - 1);
      }
    }
    touchStartX.current = null;
  };

  return (
    <Marker
      ref={markerRef}
      position={[group.latitude, group.longitude]}
      icon={createFoodIcon(currentMemory.cropped_image_url)}
    >
      <Popup closeButton={false} closeOnClick={false} autoClose={false} className="food-popup">
        <div
          className="swipe-container"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <img
            src={currentMemory.cropped_image_url}
            alt="Food"
            onClick={(e) => {
              e.stopPropagation();
              const allImages = memories.map(m => m.original_image_url);
              onOpenFullscreen(allImages, currentIndex);
            }}
            style={{
              width: '100%',
              maxWidth: '100%',
              height: 'auto',
              objectFit: 'contain',
              cursor: 'pointer',
            }}
          />
          {currentMemory.dish_name && (
            <p style={{
              margin: '0px 0 0',
              fontSize: '17px',
              fontWeight: 700,
              color: '#444',
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}>
              {currentMemory.dish_name}
            </p>
          )}

          {group.restaurant_name && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                margin: '4px 0 0',
              }}
            >
              <span style={{ fontSize: '13px', lineHeight: 1 }}>📍</span>
              {currentMemory.google_maps_url ? (
                <a
                  href={currentMemory.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '13px',
                    color: '#888',
                    textDecoration: 'underline',
                    wordBreak: 'break-word',
                  }}
                >
                  {group.restaurant_name}
                </a>
              ) : (
                <span style={{
                  fontSize: '13px',
                  color: '#888',
                  wordBreak: 'break-word',
                }}>
                  {group.restaurant_name}
                </span>
              )}
            </div>
          )}

          {/* Dot indicators */}
          {hasMultiple && (
            <div style={{
              display: 'flex',
              gap: '6px',
              marginTop: '8px',
              justifyContent: 'center',
            }}>
              {memories.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    border: 'none',
                    background: idx === currentIndex ? '#444' : '#ccc',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}


// Fullscreen image viewer with swipe support and progress bar
function FullscreenViewer({
  images,
  initialIndex,
  onClose
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const hasMultiple = images.length > 1;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartX.current - touchEndX;
    const diffY = touchStartY.current - touchEndY;

    // Check if it's a swipe (moved more than 50px horizontally)
    if (Math.abs(diffX) > 50) {
      if (diffX > 0 && currentIndex < images.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else if (diffX < 0 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }
    // Check if it's a tap (minimal movement)
    else if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && hasMultiple) {
      const screenWidth = window.innerWidth;
      const tapX = touchEndX;

      // Tap on left third → previous
      if (tapX < screenWidth / 3 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
      // Tap on right third → next
      else if (tapX > (screenWidth * 2) / 3 && currentIndex < images.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Handle click for desktop (left/right navigation)
  const handleClick = (e: React.MouseEvent) => {
    if (!hasMultiple) {
      onClose();
      return;
    }

    const screenWidth = window.innerWidth;
    const clickX = e.clientX;

    // Click on left third → previous
    if (clickX < screenWidth / 3 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    // Click on right third → next
    else if (clickX > (screenWidth * 2) / 3 && currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    // Click on middle → close
    else if (clickX >= screenWidth / 3 && clickX <= (screenWidth * 2) / 3) {
      onClose();
    }
  };

  return (
    <div
      className="fullscreen-swipe"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1001,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      {/* Progress bar at top */}
      {hasMultiple && (
        <div style={{
          position: 'absolute',
          top: '50px',
          left: '16px',
          right: '16px',
          display: 'flex',
          gap: '4px',
          zIndex: 10,
        }}>
          {images.map((_, idx) => (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              style={{
                flex: 1,
                height: '3px',
                borderRadius: '2px',
                background: idx === currentIndex
                  ? 'rgba(255, 255, 255, 0.9)'
                  : 'rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: 'absolute',
          top: '50px',
          right: '16px',
          width: '44px',
          height: '44px',
          marginTop: hasMultiple ? '20px' : '0',
          borderRadius: '50%',
          background: 'rgba(60, 60, 60, 0.8)',
          border: 'none',
          color: '#fff',
          fontSize: '24px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        ×
      </button>

      {/* Blurred background image */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        zIndex: 0,
      }}>
        <img
          src={images[currentIndex]}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(30px) brightness(0.6)',
            transform: 'scale(1.1)',
          }}
        />
      </div>

      {/* Main image container */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 1,
        minHeight: 0,
      }}>
        <img
          src={images[currentIndex]}
          alt="Full size"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            userSelect: 'none',
          }}
        />
      </div>
    </div>
  );
}

export default function FoodMemoryApp({ readOnly }: { readOnly?: boolean }) {
  const [foodMemories, setFoodMemories] = useState<FoodMemory[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<FoodMemory | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [fullscreenData, setFullscreenData] = useState<{ images: string[]; initialIndex: number } | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [pendingMemory, setPendingMemory] = useState<FoodMemory | null>(null);
  const [pendingDishName, setPendingDishName] = useState('');
  const [pendingRestaurantName, setPendingRestaurantName] = useState('');
  const [nearbyRestaurants, setNearbyRestaurants] = useState<string[]>([]);
  const [showRestaurantPicker, setShowRestaurantPicker] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [editedNote, setEditedNote] = useState('');
  const [editedDishName, setEditedDishName] = useState('');
  const [isDesktop, setIsDesktop] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markerClickedRef = useRef(false);

  // Responsive breakpoint: desktop shows list+map side by side
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Group memories by restaurant name + location (within 50m)
  const dishGroups = useMemo<DishGroup[]>(() => {
    const groups: DishGroup[] = [];

    for (const memory of foodMemories) {
      // Only group if memory has a restaurant name
      if (!memory.restaurant_name) {
        // No restaurant - treat as individual group
        groups.push({
          key: `single-${memory.id}`,
          restaurant_name: null,
          latitude: memory.latitude,
          longitude: memory.longitude,
          memories: [memory],
        });
        continue;
      }

      // Try to find an existing group with same restaurant name and within 50m
      const existingGroup = groups.find(g =>
        g.restaurant_name === memory.restaurant_name &&
        getDistanceMeters(g.latitude, g.longitude, memory.latitude, memory.longitude) <= 50
      );

      if (existingGroup) {
        existingGroup.memories.push(memory);
      } else {
        groups.push({
          key: `group-${memory.restaurant_name}-${memory.latitude}-${memory.longitude}`,
          restaurant_name: memory.restaurant_name,
          latitude: memory.latitude,
          longitude: memory.longitude,
          memories: [memory],
        });
      }
    }

    return groups;
  }, [foodMemories]);

  // Sort groups by most recent memory date (descending) for list view
  const sortedDishGroups = useMemo(() => {
    return [...dishGroups].sort((a, b) => {
      const aDate = Math.max(...a.memories.map(m => new Date(m.photo_taken_at || m.created_at).getTime()));
      const bDate = Math.max(...b.memories.map(m => new Date(m.photo_taken_at || m.created_at).getTime()));
      return bDate - aDate;
    });
  }, [dishGroups]);

  // Sync local state when selected memory changes
  useEffect(() => {
    if (selectedMemory) {
      setEditedTags(selectedMemory.friend_tags || []);
      setEditedNote(selectedMemory.personal_note || '');
      setEditedDishName(selectedMemory.dish_name || '');
    } else {
      setIsSheetExpanded(false);
      setEditedTags([]);
      setEditedNote('');
      setEditedDishName('');
      setTagInput('');
    }
  }, [selectedMemory?.id]);

  // Save changes to API
  const saveMemoryChanges = async (tags: string[], note: string, dishName?: string, restaurantName?: string) => {
    if (!selectedMemory) return;

    try {
      const payload: Record<string, unknown> = {
        friend_tags: tags.length > 0 ? tags : null,
        personal_note: note || null,
        dish_name: dishName !== undefined ? (dishName || null) : (selectedMemory.dish_name ?? null),
      };
      if (restaurantName !== undefined) {
        payload.restaurant_name = restaurantName || null;
      }

      const res = await fetch(`/api/memories/${selectedMemory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        // Update both the list and selected memory
        setFoodMemories(prev => prev.map(m => m.id === updated.id ? updated : m));
        setSelectedMemory(updated);
      }
    } catch (err) {
      console.error('Failed to save memory:', err);
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !editedTags.includes(trimmed)) {
      const newTags = [...editedTags, trimmed];
      setEditedTags(newTags);
      setTagInput('');
      saveMemoryChanges(newTags, editedNote);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = editedTags.filter(t => t !== tagToRemove);
    setEditedTags(newTags);
    saveMemoryChanges(newTags, editedNote);
  };

  const handleNoteBlur = () => {
    if (selectedMemory && editedNote !== (selectedMemory.personal_note || '')) {
      saveMemoryChanges(editedTags, editedNote);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingMemory) return;

    let finalMemory = pendingMemory;
    const dishChanged = pendingDishName !== (pendingMemory.dish_name || '');
    const restaurantChanged = pendingRestaurantName !== (pendingMemory.restaurant_name || '');

    if (dishChanged || restaurantChanged) {
      try {
        const payload: Record<string, unknown> = {
          dish_name: pendingDishName || null,
        };
        if (restaurantChanged) payload.restaurant_name = pendingRestaurantName || null;

        const res = await fetch(`/api/memories/${pendingMemory.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          finalMemory = await res.json();
        }
      } catch (err) {
        console.error('Failed to update memory names:', err);
      }
    }

    setFoodMemories(prev => [finalMemory, ...prev]);
    setMapCenter([finalMemory.latitude, finalMemory.longitude]);
    setSelectedMemory(finalMemory);
    setPendingMemory(null);
  };

  // Load existing memories on mount
  useEffect(() => {
    fetchMemories();
  }, []);

  // Close fullscreen on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenData) {
        setFullscreenData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenData]);

  // Fly to selected memory when switching to map view
  useEffect(() => {
    if (viewMode === 'map' && selectedMemory) {
      setMapCenter([selectedMemory.latitude, selectedMemory.longitude]);
    }
  }, [viewMode]);

  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories', { cache: 'no-store' });
      const data = await res.json();
      setFoodMemories(data);

      // Center map on most recent memory
      if (data.length > 0) {
        setMapCenter([data[0].latitude, data[0].longitude]);
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadStatus('Reading location...');

    try {
      // Step 1: Extract EXIF GPS data and date
      const [gps, exifData] = await Promise.all([
        exifr.gps(file),
        exifr.parse(file, { pick: ['DateTimeOriginal'] }),
      ]);
      if (!gps?.latitude || !gps?.longitude) {
        throw new Error('No location data found in this photo. Make sure location services were enabled when you took it.');
      }

      // Step 2: Upload to server (background removal happens server-side)
      setUploadStatus('Processing...');
      const formData = new FormData();
      formData.append('original', file);
      formData.append('latitude', Number(gps.latitude).toString());
      formData.append('longitude', Number(gps.longitude).toString());

      // Add photo taken date if available
      if (exifData?.DateTimeOriginal) {
        formData.append('photoTakenAt', exifData.DateTimeOriginal.toISOString());
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }

      const responseData = await res.json();
      const { nearby_restaurants, ...newMemory } = responseData;

      // Show confirmation modal instead of immediately adding to map
      setPendingMemory(newMemory);
      setPendingDishName(newMemory.dish_name || '');
      setPendingRestaurantName(newMemory.restaurant_name || '');
      setNearbyRestaurants(nearby_restaurants || []);
      setShowRestaurantPicker(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const defaultCenter: [number, number] = [40.7128, -74.006]; // NYC default

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '16px 24px',
        background: 'rgba(26, 26, 46, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '32px' }}>🍜</span>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.02em',
            }}>
              Tastory
            </h1>
            <p style={{
              margin: 0,
              fontSize: '12px',
              color: 'rgba(255,255,255,0.5)',
            }}>
              {foodMemories.length} tastes mapped
            </p>
          </div>
        </div>

        {/* Map / List toggle — mobile only */}
        {!isDesktop && (
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '10px',
            padding: '3px',
            gap: '2px',
          }}>
            <button
              onClick={() => setViewMode('map')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '32px',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'map' ? 'rgba(255,255,255,0.2)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '32px',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'list' ? 'rgba(255,255,255,0.2)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {!readOnly && <UserButton />}
      </header>

      {/* Floating Add Button - hidden when memory detail sheet is open or readOnly */}
      {!readOnly && !selectedMemory && (
        <label style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: uploading ? '#666' : '#000',
          border: '2px solid #fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'all 0.2s ease',
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          {uploading ? (
            <div style={{
              width: '24px',
              height: '24px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </label>
      )}

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          padding: '12px 20px',
          background: 'rgba(233, 69, 96, 0.95)',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '14px',
          maxWidth: '90%',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          animation: 'slideDown 0.3s ease',
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: '12px',
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              opacity: 0.7,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Map */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: isDesktop ? '380px' : 0,
        right: 0,
        bottom: 0,
        paddingTop: '72px',
        display: isDesktop ? 'block' : (viewMode === 'map' ? 'block' : 'none'),
      }}>
        <MapContainer
          center={mapCenter || defaultCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          <MapController center={mapCenter} zoom={14} />
          <MapClickHandler onMapClick={() => {
            // Use setTimeout to let marker click handler run first
            setTimeout(() => {
              if (markerClickedRef.current) {
                markerClickedRef.current = false;
                return;
              }
              setSelectedMemory(null);
            }, 0);
          }} />
          
          {dishGroups.map((group) => (
            <FoodMarker
              key={group.key}
              group={group}
              selectedMemoryId={selectedMemory?.id ?? null}
              onSelectMemory={(memory) => {
                markerClickedRef.current = true;
                setSelectedMemory(memory);
              }}
              onOpenFullscreen={(images, initialIndex) => setFullscreenData({ images, initialIndex })}
            />
          ))}
        </MapContainer>
      </div>

      {/* List view */}
      {(isDesktop || viewMode === 'list') && (
        <div style={{
          position: 'fixed',
          top: '72px',
          left: 0,
          right: isDesktop ? 'auto' : 0,
          width: isDesktop ? '380px' : undefined,
          bottom: 0,
          overflowY: 'auto',
          padding: '16px',
          paddingBottom: selectedMemory ? '180px' : '24px',
          WebkitOverflowScrolling: 'touch' as any,
          borderRight: isDesktop ? '1px solid #e0e0e0' : undefined,
          zIndex: isDesktop ? 500 : undefined,
          background: isDesktop ? '#f2f2f2' : undefined,
        }}>
          {sortedDishGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: '24px' }}>
              {/* Section header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                padding: '0 4px',
              }}>
                <span style={{ fontSize: '14px' }}>📍</span>
                <span style={{
                  color: isDesktop ? '#000' : '#fff',
                  fontSize: '15px',
                  fontWeight: 600,
                }}>
                  {group.restaurant_name || 'Unknown spot'}
                </span>
                <span style={{
                  color: isDesktop ? '#999' : 'rgba(255,255,255,0.4)',
                  fontSize: '13px',
                }}>
                  {group.memories.length} {group.memories.length === 1 ? 'dish' : 'dishes'}
                </span>
              </div>

              {/* Dish cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.memories.map((memory) => (
                  <div
                    key={memory.id}
                    onClick={() => {
                      if (selectedMemory?.id === memory.id) {
                        setSelectedMemory(null);
                      } else {
                        setSelectedMemory(memory);
                        if (isDesktop) {
                          setMapCenter([memory.latitude, memory.longitude]);
                        }
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      background: isDesktop
                        ? (selectedMemory?.id === memory.id ? '#e8e8e8' : '#fff')
                        : (selectedMemory?.id === memory.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'),
                      borderRadius: isDesktop ? '12px' : '16px',
                      border: isDesktop
                        ? (selectedMemory?.id === memory.id ? '1px solid #ccc' : '1px solid transparent')
                        : (selectedMemory?.id === memory.id ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent'),
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Thumbnail */}
                    <img
                      src={memory.cropped_image_url}
                      alt={memory.dish_name || 'Food'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenData({ images: [memory.original_image_url], initialIndex: 0 });
                      }}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '12px',
                        objectFit: 'cover',
                        flexShrink: 0,
                        cursor: 'pointer',
                      }}
                    />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: isDesktop ? '#000' : '#fff',
                        fontSize: isDesktop ? '14px' : '15px',
                        fontWeight: isDesktop ? 500 : 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {memory.dish_name || 'Untitled dish'}
                      </div>
                      <div style={{
                        color: isDesktop ? '#999' : 'rgba(255,255,255,0.4)',
                        fontSize: isDesktop ? '12px' : '13px',
                        marginTop: '2px',
                      }}>
                        {new Date(memory.photo_taken_at || memory.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>

                    {/* Friend tag avatars */}
                    {memory.friend_tags && memory.friend_tags.length > 0 && (
                      <div style={{ display: 'flex', flexShrink: 0 }}>
                        {memory.friend_tags.slice(0, 3).map((tag, i) => (
                          <span
                            key={tag}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: isDesktop ? '#e0e0e0' : '#DCD0FF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: isDesktop ? '#555' : '#5A4A7A',
                              marginLeft: i > 0 ? '-8px' : '0',
                              border: isDesktop ? '2px solid #fff' : '2px solid rgba(26, 26, 46, 0.95)',
                              zIndex: 3 - i,
                              position: 'relative',
                            }}
                          >
                            {tag.charAt(0).toUpperCase()}
                          </span>
                        ))}
                        {memory.friend_tags.length > 3 && (
                          <span style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: isDesktop ? '#f0f0f0' : 'rgba(255,255,255,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isDesktop ? '#999' : 'rgba(255,255,255,0.6)',
                            marginLeft: '-8px',
                            border: isDesktop ? '2px solid #fff' : '2px solid rgba(26, 26, 46, 0.95)',
                          }}>
                            +{memory.friend_tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload status */}
      {!readOnly && uploading && uploadStatus && (
        <div style={{
          position: 'fixed',
          bottom: '88px',
          right: '24px',
          zIndex: 999,
          padding: '8px 12px',
          background: '#000',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {uploadStatus}
        </div>
      )}

      {/* Memory detail sheet */}
      {selectedMemory && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: isDesktop ? '380px' : 0,
            right: 0,
            zIndex: 998,
            background: isDesktop ? 'rgba(255, 255, 255, 0.95)' : 'rgba(26, 26, 46, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: isDesktop ? '0' : '24px 24px 0 0',
            borderTop: isDesktop ? '1px solid #e0e0e0' : undefined,
            padding: '16px 20px',
            animation: 'slideUp 0.3s ease',
          }}
        >
          {/* Swipe handle — mobile only */}
          {!isDesktop && (
            <div style={{
              width: '36px',
              height: '4px',
              background: 'rgba(255,255,255,0.3)',
              borderRadius: '2px',
              margin: '0 auto 10px',
            }} />
          )}

          {/* Neighborhood + Date — always visible */}
          <p style={{
            margin: 0,
            color: isDesktop ? '#999' : 'rgba(255,255,255,0.5)',
            fontSize: '13px',
          }}>
            {new Date(selectedMemory.photo_taken_at || selectedMemory.created_at).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            {selectedMemory.neighborhood && (
              <>
                {'  ·  '}
                {selectedMemory.neighborhood}
              </>
            )}
          </p>

          {/* Friend tags — show if tags exist, or in creator mode */}
          {(editedTags.length > 0 || !readOnly) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {editedTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 16px 4px 4px',
                    background: isDesktop ? '#f0f0f0' : '#DCD0FF',
                    borderRadius: '24px',
                    color: isDesktop ? '#333' : '#1a1a1a',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  <span style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isDesktop ? '#ddd' : '#D4C8E8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isDesktop ? '#555' : '#5A4A7A',
                  }}>
                    {tag.charAt(0).toUpperCase()}
                  </span>
                  {tag}
                  {!readOnly && (
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isDesktop ? '#999' : '#9A8AAA',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: '4px',
                        fontSize: '16px',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}

              {/* "+ Add name" inline input chip — creator only */}
              {!readOnly && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px 4px 4px',
                  border: isDesktop ? '1px dashed #ccc' : '1px dashed rgba(255,255,255,0.3)',
                  borderRadius: '20px',
                }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: isDesktop ? '#f0f0f0' : 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    color: isDesktop ? '#999' : 'rgba(255,255,255,0.5)',
                  }}>+</span>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add name"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isDesktop ? '#333' : '#fff',
                      fontSize: '14px',
                      outline: 'none',
                      width: '70px',
                    }}
                  />
                </span>
              )}
            </div>
          )}

          {/* Personal note — show if note exists, or in creator mode */}
          {(editedNote || !readOnly) && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              marginTop: '12px',
            }}>
              <span style={{ fontSize: '13px' }}>✨</span>
              {readOnly ? (
                <span style={{
                  flex: 1,
                  color: isDesktop ? '#333' : '#fff',
                  fontSize: '14px',
                }}>
                  {editedNote}
                </span>
              ) : (
                <textarea
                  value={editedNote}
                  onChange={(e) => setEditedNote(e.target.value)}
                  onBlur={handleNoteBlur}
                  placeholder="Add a personal note..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: isDesktop ? (editedNote ? '#333' : '#999') : (editedNote ? '#fff' : 'rgba(255,255,255,0.4)'),
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'none',
                    minHeight: '20px',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload confirmation modal */}
      {!readOnly && pendingMemory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1002,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '28px 24px',
            width: '90%',
            maxWidth: '340px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}>
            <img
              src={pendingMemory.cropped_image_url}
              alt="Food"
              style={{
                width: '160px',
                height: '160px',
                objectFit: 'contain',
                borderRadius: '16px',
                background: '#f5f5f5',
              }}
            />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{
                  display: 'block',
                  color: '#999',
                  fontSize: '12px',
                  marginBottom: '4px',
                  fontWeight: 500,
                }}>Dish name</label>
                <input
                  type="text"
                  value={pendingDishName}
                  onChange={(e) => setPendingDishName(e.target.value)}
                  placeholder="What did you eat?"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid #e0e0e0',
                    background: '#f8f8f8',
                    color: '#1a1a1a',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ position: 'relative' }}>
                <label style={{
                  display: 'block',
                  color: '#999',
                  fontSize: '12px',
                  marginBottom: '4px',
                  fontWeight: 500,
                }}>Restaurant</label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '12px',
                  border: showRestaurantPicker ? '1px solid #1a1a1a' : '1px solid #e0e0e0',
                  background: '#f8f8f8',
                  boxSizing: 'border-box',
                }}>
                  <input
                    type="text"
                    value={pendingRestaurantName}
                    onChange={(e) => setPendingRestaurantName(e.target.value)}
                    onFocus={() => nearbyRestaurants.length > 0 && setShowRestaurantPicker(true)}
                    placeholder="Where was it?"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      color: '#1a1a1a',
                      fontSize: '16px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {nearbyRestaurants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowRestaurantPicker(!showRestaurantPicker)}
                      style={{
                        padding: '10px 12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          transform: showRestaurantPicker ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
                {showRestaurantPicker && nearbyRestaurants.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: '#fff',
                    border: '1px solid #e0e0e0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    zIndex: 10,
                  }}>
                    {nearbyRestaurants.map((name, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setPendingRestaurantName(name);
                          setShowRestaurantPicker(false);
                        }}
                        style={{
                          padding: '10px 12px',
                          fontSize: '15px',
                          color: '#1a1a1a',
                          cursor: 'pointer',
                          background: name === pendingRestaurantName ? '#f0f0f0' : 'transparent',
                          borderBottom: i < nearbyRestaurants.length - 1 ? '1px solid #f0f0f0' : 'none',
                          borderRadius: i === 0 ? '12px 12px 0 0' : i === nearbyRestaurants.length - 1 ? '0 0 12px 12px' : '0',
                        }}
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleConfirmUpload}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '14px',
                border: 'none',
                background: '#1a1a1a',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen image viewer with swipe */}
      {fullscreenData && (
        <FullscreenViewer
          images={fullscreenData.images}
          initialIndex={fullscreenData.initialIndex}
          onClose={() => setFullscreenData(null)}
        />
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 140px !important;
          padding: 0 !important;
          width: 260px !important;
          box-shadow: 0 8px 20px rgba(0,0,0,0.25) !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          width: 260px !important;
          padding: 36px 20px 44px !important;
          box-sizing: border-box;
        }
        .food-marker {
          background: none !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
