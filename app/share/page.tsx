'use client';

import dynamic from 'next/dynamic';

const FoodMemoryApp = dynamic(() => import('../FoodMemoryApp'), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        textAlign: 'center',
        color: '#fff',
      }}>
        <span style={{ fontSize: '48px' }}>🍜</span>
        <p style={{ marginTop: '16px', opacity: 0.7 }}>Loading food memories...</p>
      </div>
    </div>
  ),
});

export default function SharePage() {
  return <FoodMemoryApp readOnly />;
}
