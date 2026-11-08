import React from 'react';
import { warwickWolfImg } from '../assets';

export interface WolfAvatarProps {
  /** Diameter in pixels. */
  size: number;
  /** Optional id, used as the Sarab mirage origin anchor. */
  id?: string;
  alt?: string;
  /** Adds the soft ember halo behind the ring (hero usage). */
  halo?: boolean;
  className?: string;
  title?: string;
}

/**
 * Shared WarWick portrait.
 *
 * The artwork is a tan disc on a black square; rendering it borderless with a
 * slight zoom removes the dark fringe, and the warm filter keeps the fur from
 * turning muddy against the Wolf Gold surfaces. The ring is a gold-to-ember
 * conic band instead of a flat border so the portrait reads as a medallion.
 */
export const WolfAvatar: React.FC<WolfAvatarProps> = ({
  size,
  id,
  alt = 'WarWick',
  halo = false,
  className = '',
  title
}) => {
  const ring = Math.max(2, Math.round(size / 18));
  const inset = Math.max(1, Math.round(size / 48));

  return (
    <div
      className={`relative rounded-full shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        padding: ring,
        background:
          'conic-gradient(from 205deg, #6f4a12 0%, #f2b632 16%, #f8d47a 30%, #d9652f 48%, #f2b632 66%, #8a5a14 84%, #f2b632 100%)',
        boxShadow: halo
          ? '0 0 0 1px rgba(0,0,0,0.55), 0 10px 26px rgba(0,0,0,0.5), 0 0 34px rgba(226,58,34,0.22)'
          : '0 0 0 1px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)'
      }}
      title={title}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden"
        style={{
          background: 'var(--bg-panel)',
          boxShadow: `inset 0 0 ${Math.round(size / 6)}px rgba(0,0,0,0.55)`
        }}
      >
        <img
          id={id}
          src={warwickWolfImg}
          alt={alt}
          draggable={false}
          className="w-full h-full object-cover"
          style={{
            transform: `scale(${1 + inset / 20})`,
            objectPosition: '50% 42%',
            filter:
              size < 32
                ? 'brightness(1.16) contrast(1.12) saturate(1.2)'
                : 'brightness(1.06) contrast(1.1) saturate(1.14)'
          }}
        />
      </div>
    </div>
  );
};

export default WolfAvatar;
