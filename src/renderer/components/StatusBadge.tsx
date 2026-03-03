import React from 'react';
import { clsx } from 'clsx';
import type { DoorStatus } from '../../shared/types';

interface StatusBadgeProps {
  status: DoorStatus;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<DoorStatus, { label: string; bgClass: string; textClass: string; glowClass: string }> = {
  Open: {
    label: 'Open',
    bgClass: 'bg-status-open/10 border-status-open/30',
    textClass: 'text-status-open',
    glowClass: 'status-glow-open',
  },
  Offload: {
    label: 'Offload',
    bgClass: 'bg-status-offload/10 border-status-offload/30',
    textClass: 'text-status-offload',
    glowClass: 'status-glow-offload',
  },
  Loading: {
    label: 'Loading',
    bgClass: 'bg-status-loading/10 border-status-loading/30',
    textClass: 'text-status-loading',
    glowClass: 'status-glow-loading',
  },
  Blocked: {
    label: 'Blocked',
    bgClass: 'bg-gray-900 border-gray-700',
    textClass: 'text-gray-300',
    glowClass: '',
  },
  Waiting: {
    label: 'Waiting',
    bgClass: 'bg-status-waiting/10 border-status-waiting/30',
    textClass: 'text-status-waiting',
    glowClass: 'status-glow-waiting',
  },
  Parked: {
    label: 'Parked',
    bgClass: 'bg-status-parked/10 border-status-parked/30',
    textClass: 'text-status-parked',
    glowClass: 'status-glow-parked',
  },
  Dropped: {
    label: 'Dropped',
    bgClass: 'bg-status-dropped/10 border-status-dropped/30',
    textClass: 'text-status-dropped',
    glowClass: 'status-glow-dropped',
  },
  Offline: {
    label: 'Offline',
    bgClass: 'bg-gray-900 border-gray-700',
    textClass: 'text-gray-400',
    glowClass: '',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  pulse = false,
  size = 'md',
  className,
}) => {
  const config = statusConfig[status];
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold uppercase tracking-wide',
        'border rounded-sm transition-all duration-150',
        config.bgClass,
        config.textClass,
        pulse && config.glowClass,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
    </span>
  );
};
