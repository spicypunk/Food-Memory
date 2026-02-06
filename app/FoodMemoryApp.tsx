'use client';

import React, { useState, useEffect, useRef } from 'react';
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

// Food marker with synced popup
function FoodMarker({
  memory,
  isSelected,
  onSelect,
  onImageClick
}: {
  memory: FoodMemory;
  isSelected: boolean;
  onSelect: () => void;
  onImageClick: (imageUrl: string) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

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
          onSelect();
        };
        el.addEventListener('click', handleClick);
        return () => el.removeEventListener('click', handleClick);
      }
    }
  }, [onSelect]);

  return (
    <Marker
      ref={markerRef}
      position={[memory.latitude, memory.longitude]}
      icon={createFoodIcon(memory.cropped_image_url)}
    >
      <Popup closeButton={false} closeOnClick={false} autoClose={false} className="food-popup">
        <div style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <img
            src={memory.cropped_image_url}
            alt="Food"
            onClick={(e) => {
              e.stopPropagation();
              onImageClick(memory.original_image_url);
            }}
            style={{
              width: '100%',
              maxWidth: '100%',
              height: 'auto',
              objectFit: 'contain',
              cursor: 'pointer',
            }}
          />
          {memory.dish_name && (
            <p style={{
              margin: '0px 0 0',
              fontSize: '17px',
              fontWeight: 700,
              color: '#444',
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}>
              {memory.dish_name}
            </p>
          )}
          {memory.restaurant_name && (
            memory.google_maps_url ? (
              <a
                href={memory.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  margin: '4px 0 0',
                  color: '#999',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
              >
                📍 {memory.restaurant_name}
              </a>
            ) : (
              <p style={{
                margin: '4px 0 0',
                color: '#999',
                fontSize: '12px',
              }}>
                📍 {memory.restaurant_name}
              </p>
            )
          )}
        </div>
      </Popup>
    </Marker>
  );
}


export default function FoodMemoryApp() {
  const [foodMemories, setFoodMemories] = useState<FoodMemory[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<FoodMemory | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [pendingMemory, setPendingMemory] = useState<FoodMemory | null>(null);
  const [pendingDishName, setPendingDishName] = useState('');
  const [pendingRestaurantName, setPendingRestaurantName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [editedNote, setEditedNote] = useState('');
  const [editedDishName, setEditedDishName] = useState('');
  const [editedRestaurantName, setEditedRestaurantName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markerClickedRef = useRef(false);

  // Sync local state when selected memory changes
  useEffect(() => {
    if (selectedMemory) {
      setEditedTags(selectedMemory.friend_tags || []);
      setEditedNote(selectedMemory.personal_note || '');
      setEditedDishName(selectedMemory.dish_name || '');
      setEditedRestaurantName(selectedMemory.restaurant_name || '');
    } else {
      setIsSheetExpanded(false);
      setEditedTags([]);
      setEditedNote('');
      setEditedDishName('');
      setEditedRestaurantName('');
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
      if (e.key === 'Escape' && fullscreenImage) {
        setFullscreenImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenImage]);

  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories');
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

      const newMemory = await res.json();

      // Show confirmation modal instead of immediately adding to map
      setPendingMemory(newMemory);
      setPendingDishName(newMemory.dish_name || '');
      setPendingRestaurantName(newMemory.restaurant_name || '');

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
              Food Memory
            </h1>
            <p style={{
              margin: 0,
              fontSize: '12px',
              color: 'rgba(255,255,255,0.5)',
            }}>
              {foodMemories.length} memories mapped
            </p>
          </div>
        </div>

      </header>

      {/* Floating Add Button - hidden when memory detail sheet is open */}
      {!selectedMemory && (
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
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: '72px',
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
          
          {foodMemories.map((memory) => (
            <FoodMarker
              key={memory.id}
              memory={memory}
              isSelected={selectedMemory?.id === memory.id}
              onSelect={() => {
                markerClickedRef.current = true;
                setSelectedMemory(prev => prev?.id === memory.id ? null : memory);
              }}
              onImageClick={(imageUrl) => setFullscreenImage(imageUrl)}
            />
          ))}
        </MapContainer>
      </div>

      {/* Upload status */}
      {uploading && uploadStatus && (
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
          onClick={() => setIsSheetExpanded(!isSheetExpanded)}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 998,
            background: 'rgba(26, 26, 46, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px 24px 0 0',
            padding: '20px',
            animation: 'slideUp 0.3s ease',
            transition: 'max-height 0.3s ease',
            maxHeight: isSheetExpanded ? '70vh' : '160px',
            overflow: 'hidden',
          }}
        >
          {/* Swipe handle */}
          <div style={{
            width: '36px',
            height: '4px',
            background: 'rgba(255,255,255,0.3)',
            borderRadius: '2px',
            margin: '0 auto 12px',
          }} />

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <img
              src={selectedMemory.cropped_image_url}
              alt="Food"
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'contain',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.05)',
              }}
            />
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editedDishName}
                onChange={(e) => setEditedDishName(e.target.value)}
                onBlur={() => {
                  if (editedDishName !== (selectedMemory.dish_name || '')) {
                    saveMemoryChanges(editedTags, editedNote, editedDishName);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Add dish name..."
                style={{
                  margin: 0,
                  color: '#fff',
                  fontSize: '18px',
                  fontWeight: 700,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: 0,
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              />
              <p style={{
                margin: '4px 0 0',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '13px',
              }}>
                {new Date(selectedMemory.photo_taken_at || selectedMemory.created_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              {selectedMemory.restaurant_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px' }}>📍</span>
                  <span style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '12px',
                  }}>
                    {selectedMemory.restaurant_name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Expanded content */}
          {isSheetExpanded && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* Friend tags section - contact chip style */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {editedTags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 16px 4px 4px',
                      background: '#DCD0FF',
                      borderRadius: '24px',
                      color: '#1a1a1a',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    {/* Avatar circle with initial */}
                    <span style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#D4C8E8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#5A4A7A',
                    }}>
                      {tag.charAt(0).toUpperCase()}
                    </span>
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#9A8AAA',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: '4px',
                        fontSize: '16px',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}

                {/* "+ Add name" inline input chip */}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px 4px 4px',
                  border: '1px dashed rgba(255,255,255,0.3)',
                  borderRadius: '20px',
                }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.5)',
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
                      color: '#fff',
                      fontSize: '14px',
                      outline: 'none',
                      width: '70px',
                    }}
                  />
                </span>
              </div>

              {/* Personal note section - borderless */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}>
                <span style={{ fontSize: '13px' }}>✨</span>
                <textarea
                  value={editedNote}
                  onChange={(e) => setEditedNote(e.target.value)}
                  onBlur={handleNoteBlur}
                  placeholder="Add a personal note..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: editedNote ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'none',
                    minHeight: '20px',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload confirmation modal */}
      {pendingMemory && (
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
            background: 'rgba(26, 26, 46, 0.98)',
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
                background: 'rgba(255,255,255,0.05)',
              }}
            />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{
                  display: 'block',
                  color: 'rgba(255,255,255,0.5)',
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
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '12px',
                  marginBottom: '4px',
                  fontWeight: 500,
                }}>Restaurant</label>
                <input
                  type="text"
                  value={pendingRestaurantName}
                  onChange={(e) => setPendingRestaurantName(e.target.value)}
                  placeholder="Where was it?"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleConfirmUpload}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '14px',
                border: 'none',
                background: '#fff',
                color: '#1a1a2e',
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

      {/* Fullscreen image viewer */}
      {fullscreenImage && (
        <div
          onClick={() => setFullscreenImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1001,
            background: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <button
            onClick={() => setFullscreenImage(null)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#fff',
              fontSize: '24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
          <img
            src={fullscreenImage}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '95%',
              maxHeight: '95%',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
          />
        </div>
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
