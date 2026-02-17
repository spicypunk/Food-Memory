'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SignUp, UserButton, useUser } from '@clerk/nextjs';
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
  borough: string | null;
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

export default function FoodMemoryApp({ readOnly, shareUserId }: { readOnly?: boolean; shareUserId?: string }) {
  const { isLoaded, user } = useUser();
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
  const [collapsedBoroughs, setCollapsedBoroughs] = useState<Set<string>>(new Set());
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [shareUserName, setShareUserName] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markerClickedRef = useRef(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isFirstUpload, setIsFirstUpload] = useState(false);
  const prevShowNameModalRef = useRef(showNameModal);
  const [pendingFileData, setPendingFileData] = useState<{
    file: File;
    latitude: number;
    longitude: number;
    photoTakenAt: string | null;
  } | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const uploadResumedRef = useRef(false);

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

  // Group sorted dish groups by borough
  const boroughGroups = useMemo(() => {
    const groups: Record<string, { borough: string; dishGroups: DishGroup[]; dishCount: number }> = {};

    for (const group of sortedDishGroups) {
      const borough = group.memories[0]?.borough || 'Other';

      if (!groups[borough]) {
        groups[borough] = { borough, dishGroups: [], dishCount: 0 };
      }
      groups[borough].dishGroups.push(group);
      groups[borough].dishCount += group.memories.length;
    }

    return Object.values(groups).sort((a, b) => b.dishCount - a.dishCount);
  }, [sortedDishGroups]);

  const confettiParticles = useMemo(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      duration: 1.8 + Math.random() * 1.4,
      delay: Math.random() * 1.2,
      color: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8', '#20c997'][i % 7],
      shape: i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'square' : 'strip',
    })),
  []);

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

    if (isFirstUpload) {
      setShowCelebration(true);
      setIsFirstUpload(false);
      localStorage.setItem('tastory-onboarding-done', 'true');
      setTimeout(() => setShowCelebration(false), 3000);
    }

    setPendingMemory(null);
  };

  // Load existing memories on mount
  useEffect(() => {
    if (!isLoaded) return;
    fetchMemories();
  }, [isLoaded, shareUserId, user?.id]);

  // Check if user has set a display name (onboarding)
  useEffect(() => {
    if (readOnly || !user) return;
    const checkUser = async () => {
      try {
        const res = await fetch('/api/user', { cache: 'no-store' });
        const data = await res.json();
        if (data && data.display_name) {
          setDisplayName(data.display_name);
        } else {
          setShowNameModal(true);
        }
      } catch (err) {
        console.error('Failed to check user profile:', err);
      }
    };
    checkUser();
  }, [readOnly, user?.id]);

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

  // Guest walkthrough trigger: start onboarding for unauthenticated visitors
  useEffect(() => {
    if (!isLoaded || user || readOnly) return;
    if (!localStorage.getItem('tastory-onboarding-done') && foodMemories.length === 0) {
      setOnboardingStep(1);
    }
  }, [isLoaded, user, readOnly, foodMemories.length]);

  // Onboarding walkthrough trigger: when name modal closes for first-time user
  useEffect(() => {
    if (prevShowNameModalRef.current && !showNameModal && !pendingMemory && !uploading) {
      if (!localStorage.getItem('tastory-onboarding-done') && foodMemories.length === 0) {
        setOnboardingStep(1);
      }
    }
    prevShowNameModalRef.current = showNameModal;
  }, [showNameModal, foodMemories.length]);

  // Auth-resume: after guest signs up, upload file then show confirmation modal
  useEffect(() => {
    if (!user?.id || !pendingFileData || uploadResumedRef.current) return;
    uploadResumedRef.current = true;
    setShowAuthGate(false);
    const fileData = pendingFileData;
    setPendingFileData(null);

    (async () => {
      setUploading(true);
      setUploadStatus('Processing...');
      try {
        const formData = new FormData();
        formData.append('original', fileData.file);
        formData.append('latitude', fileData.latitude.toString());
        formData.append('longitude', fileData.longitude.toString());
        if (fileData.photoTakenAt) formData.append('photoTakenAt', fileData.photoTakenAt);

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
        const { nearby_restaurants, ...newMemory } = await res.json();

        // Show confirmation modal with AI-detected dish name + restaurant
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
      }
    })();
  }, [user?.id, pendingFileData]);

  // Fly to selected memory when switching to map view
  useEffect(() => {
    if (viewMode === 'map' && selectedMemory) {
      setMapCenter([selectedMemory.latitude, selectedMemory.longitude]);
    }
  }, [viewMode]);

  const fetchMemories = async () => {
    try {
      if (shareUserId) {
        // Public share view — fetch from share API
        const res = await fetch(`/api/share/${shareUserId}`, { cache: 'no-store' });
        const data = await res.json();
        setFoodMemories(data.memories || []);
        if (data.user?.display_name) {
          setShareUserName(data.user.display_name);
        }
        if (data.memories?.length > 0) {
          setMapCenter([data.memories[0].latitude, data.memories[0].longitude]);
        }
      } else if (user) {
        // Authenticated user — fetch own memories
        const res = await fetch('/api/memories', { cache: 'no-store' });
        const data = await res.json();
        setFoodMemories(data);
        if (data.length > 0) {
          setMapCenter([data[0].latitude, data[0].longitude]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch memories:', err);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (foodMemories.length === 0) setIsFirstUpload(true);
    if (onboardingStep > 0) {
      setOnboardingStep(0);
      localStorage.setItem('tastory-onboarding-done', 'true');
    }

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

      const latitude = Number(gps.latitude);
      const longitude = Number(gps.longitude);
      const photoTakenAt = exifData?.DateTimeOriginal
        ? exifData.DateTimeOriginal.toISOString()
        : null;

      if (!user) {
        // Guest path: store file data and show auth gate immediately
        setPendingFileData({ file, latitude, longitude, photoTakenAt });
        setShowAuthGate(true);
      } else {
        // Authenticated path: upload to server immediately
        setUploadStatus('Processing...');
        const formData = new FormData();
        formData.append('original', file);
        formData.append('latitude', latitude.toString());
        formData.append('longitude', longitude.toString());
        if (photoTakenAt) formData.append('photoTakenAt', photoTakenAt);

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
      }

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

  const defaultCenter: [number, number] = [40.741932089424466, -73.99287778355064]; // Manhattan

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
          <a href="/" style={{ fontSize: '32px', textDecoration: 'none', cursor: 'pointer' }}>🍜</a>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.02em',
            }}>
              {readOnly && shareUserId
                ? (shareUserName ? `${shareUserName}'s Food Map` : 'Food Map')
                : 'Tastory'}
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

        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Share button */}
            {user && (
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}/share/${user.id}`;
                  const copyToClipboard = (text: string) => {
                    if (navigator.clipboard?.writeText) {
                      return navigator.clipboard.writeText(text);
                    }
                    // Fallback for non-HTTPS contexts
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    return Promise.resolve();
                  };
                  copyToClipboard(shareUrl).then(() => {
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                {shareCopied && (
                  <span style={{
                    position: 'absolute',
                    top: '44px',
                    right: 0,
                    background: '#000',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    Link copied!
                  </span>
                )}
              </button>
            )}
            {user ? (
              <UserButton />
            ) : isLoaded ? (
              <button
                onClick={() => setShowAuthGate(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Sign In
              </button>
            ) : null}
          </div>
        )}
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
          boxShadow: foodMemories.length === 0 && !uploading
            ? '0 0 0 6px rgba(255,255,255,0.3), 0 0 0 12px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.3)'
            : '0 4px 12px rgba(0,0,0,0.3)',
          animation: foodMemories.length === 0 && !uploading ? 'fabPulse 2s ease-in-out infinite' : 'none',
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

      {/* Share page CTA button */}
      {readOnly && shareUserId && !selectedMemory && (
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 999,
            padding: '12px 22px',
            borderRadius: '28px',
            border: 'none',
            background: '#000',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'slideUp 0.3s ease',
          }}
        >
          Start mapping
        </button>
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
        left: isDesktop && foodMemories.length > 0 ? '380px' : 0,
        right: 0,
        bottom: 0,
        paddingTop: '72px',
        paddingBottom: 0,
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

      {/* List view — hidden when no memories */}
      {(isDesktop || viewMode === 'list') && foodMemories.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '72px',
          left: 0,
          right: isDesktop ? 'auto' : 0,
          width: isDesktop ? '380px' : undefined,
          bottom: 0,
          overflowY: 'auto',
          padding: 0,
          paddingBottom: selectedMemory ? '180px' : '24px',
          WebkitOverflowScrolling: 'touch' as any,
          borderRight: isDesktop ? '1px solid #e0e0e0' : undefined,
          zIndex: isDesktop ? 500 : undefined,
          background: '#f2f2f2',
        }}>
          {boroughGroups.map(({ borough, dishGroups: bGroups, dishCount }) => (
            <div key={borough}>
              {/* Sticky borough header */}
              <div
                onClick={() => {
                  setCollapsedBoroughs(prev => {
                    const next = new Set(prev);
                    if (next.has(borough)) next.delete(borough);
                    else next.add(borough);
                    return next;
                  });
                }}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: '#f2f2f2',
                  borderBottom: '1px solid #e0e0e0',
                  borderTop: '1px solid #e0e0e0',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <span style={{
                  color: '#999',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  {borough}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    color: '#bbb',
                    fontSize: '14px',
                  }}>
                    {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
                  </span>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#bbb"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      transform: collapsedBoroughs.has(borough) ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>

              {/* Restaurant groups within this borough */}
              {!collapsedBoroughs.has(borough) && (
                <div style={{ padding: '8px 16px 16px' }}>
                  {bGroups.map((group) => (
                    <div key={group.key} style={{ marginBottom: '24px' }}>
                      {/* Restaurant header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '12px',
                        padding: '0 4px',
                      }}>
                        <span style={{ fontSize: '14px' }}>📍</span>
                        <span style={{
                          color: '#000',
                          fontSize: '15px',
                          fontWeight: 600,
                        }}>
                          {group.restaurant_name || 'Unknown spot'}
                        </span>
                        <span style={{ flex: 1 }} />
                        <span style={{
                          color: '#999',
                          fontSize: '13px',
                        }}>
                          {group.memories[0]?.neighborhood || ''}
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
                              background: selectedMemory?.id === memory.id ? '#e8e8e8' : '#fff',
                              borderRadius: '12px',
                              border: selectedMemory?.id === memory.id ? '1px solid #ccc' : '1px solid transparent',
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
                                color: '#000',
                                fontSize: '14px',
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {memory.dish_name || 'Untitled dish'}
                              </div>
                              <div style={{
                                color: '#999',
                                fontSize: '12px',
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
                                      background: '#e0e0e0',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      color: '#555',
                                      marginLeft: i > 0 ? '-8px' : '0',
                                      border: '2px solid #fff',
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
                                    background: '#f0f0f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#999',
                                    marginLeft: '-8px',
                                    border: '2px solid #fff',
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
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: isDesktop ? '0' : '24px 24px 0 0',
            borderTop: '1px solid #e0e0e0',
            padding: '16px 20px',
            animation: 'slideUp 0.3s ease',
          }}
        >
          {/* Swipe handle — mobile only */}
          {!isDesktop && (
            <div style={{
              width: '36px',
              height: '4px',
              background: '#ccc',
              borderRadius: '2px',
              margin: '0 auto 10px',
            }} />
          )}

          {/* Neighborhood + Date — always visible */}
          <p style={{
            margin: 0,
            color: '#999',
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
                    background: '#f0f0f0',
                    borderRadius: '24px',
                    color: '#333',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  <span style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#ddd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#555',
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
                        color: '#999',
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
                  border: '1px dashed #ccc',
                  borderRadius: '20px',
                }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    color: '#999',
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
                      color: '#333',
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
                  color: '#333',
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
                    color: editedNote ? '#333' : '#999',
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

      {/* Onboarding name modal */}
      {showNameModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1003,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '32px 24px',
            width: '90%',
            maxWidth: '340px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}>
            <span style={{ fontSize: '48px' }}>🍜</span>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1a1a1a' }}>
                Welcome to Tastory
              </h2>
              <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#888' }}>
                What should we call you?
              </p>
            </div>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  e.preventDefault();
                  const saveName = async () => {
                    try {
                      const res = await fetch('/api/user', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ display_name: nameInput.trim() }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setDisplayName(data.display_name);
                        setShowNameModal(false);
                      }
                    } catch (err) {
                      console.error('Failed to save name:', err);
                    }
                  };
                  saveName();
                }
              }}
              placeholder="Your name"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #e0e0e0',
                background: '#f8f8f8',
                color: '#1a1a1a',
                fontSize: '16px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            />
            <button
              onClick={async () => {
                if (!nameInput.trim()) return;
                try {
                  const res = await fetch('/api/user', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ display_name: nameInput.trim() }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setDisplayName(data.display_name);
                    setShowNameModal(false);
                  }
                } catch (err) {
                  console.error('Failed to save name:', err);
                }
              }}
              disabled={!nameInput.trim()}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '14px',
                border: 'none',
                background: nameInput.trim() ? '#1a1a1a' : '#ccc',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                cursor: nameInput.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Auth gate modal */}
      {showAuthGate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1004,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }}>
          <button
            onClick={() => {
              setShowAuthGate(false);
              setPendingFileData(null);
              uploadResumedRef.current = false;
            }}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
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
          <p style={{
            color: '#fff',
            fontSize: '18px',
            fontWeight: 700,
            marginBottom: '20px',
            textAlign: 'center',
          }}>
            Sign up to save your food memory
          </p>
          <SignUp routing="hash" forceRedirectUrl="/" />
        </div>
      )}

      {/* Onboarding walkthrough overlay */}
      {onboardingStep === 1 && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          pointerEvents: 'none',
        }}>
          {/* Spotlight ring on FAB (bottom-right) */}
          <div style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 80,
            height: 80,
            borderRadius: '50%',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
          }} />
          {/* Tooltip card — positioned above-left of FAB */}
          <div style={{
            position: 'absolute',
            bottom: 108,
            right: 16,
            background: '#fff',
            borderRadius: 16,
            padding: '20px 24px',
            width: 280,
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            pointerEvents: 'auto',
            animation: 'slideUp 0.3s ease-out',
          }}>
            {/* Step indicator */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 14,
            }}>
              {[1, 2].map(step => (
                <div key={step} style={{
                  width: step === 1 ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: step === 1 ? '#1a1a1a' : '#ddd',
                  transition: 'all 0.2s ease',
                }} />
              ))}
            </div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: '#1a1a1a' }}>
              Add your first memory
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 1.4 }}>
              Tap the + button to upload a food photo with location data
            </div>
            {/* Arrow pointing down-right to FAB */}
            <div style={{
              position: 'absolute',
              bottom: -10,
              right: 36,
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '10px solid #fff',
            }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setOnboardingStep(0);
                  localStorage.setItem('tastory-onboarding-done', 'true');
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: '1px solid #ddd',
                  background: '#fff',
                  color: '#666',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Skip
              </button>
              <button
                onClick={() => setOnboardingStep(2)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#1a1a1a',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {onboardingStep === 2 && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 20,
            padding: '28px 24px',
            width: 300,
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            animation: 'slideUp 0.3s ease-out',
          }}>
            {/* Step indicator */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 14,
            }}>
              {[1, 2].map(step => (
                <div key={step} style={{
                  width: step === 2 ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: step === 2 ? '#1a1a1a' : '#ddd',
                  transition: 'all 0.2s ease',
                }} />
              ))}
            </div>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📍</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: '#1a1a1a' }}>
              Photos land on the map
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 1.4 }}>
              Your food photos will be placed on the map using their GPS data. Build a visual journal of everywhere you eat!
            </div>
            <button
              onClick={() => {
                setOnboardingStep(0);
                localStorage.setItem('tastory-onboarding-done', 'true');
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 12,
                border: 'none',
                background: '#1a1a1a',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {"Let's go!"}
            </button>
          </div>
        </div>
      )}

      {/* First-upload celebration confetti */}
      {showCelebration && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10001,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}>
          {confettiParticles.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                top: -20,
                left: `${p.left}%`,
                width: p.shape === 'strip' ? p.size * 0.4 : p.size,
                height: p.shape === 'strip' ? p.size * 1.6 : p.size,
                borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'strip' ? 2 : 0,
                background: p.color,
                animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
                opacity: 0,
              }}
            />
          ))}
          <div style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            animation: 'celebrationPop 0.5s 0.2s ease-out forwards',
            opacity: 0,
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#fff',
              textShadow: '0 2px 12px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
            }}>
              First memory added!
            </div>
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
        @keyframes fabPulse {
          0%, 100% { box-shadow: 0 0 0 6px rgba(255,255,255,0.3), 0 0 0 12px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 10px rgba(255,255,255,0.4), 0 0 0 20px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.3); }
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
        @keyframes confettiFall {
          0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.6; }
        }
        @keyframes celebrationPop {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
          70% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
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
