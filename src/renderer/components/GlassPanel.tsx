import React from 'react';
import { clsx } from 'clsx';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'strong';
  hover?: boolean;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className,
  variant = 'default',
  hover = false,
}) => {
  return (
    <div
      className={clsx(
        'rounded-sm',
        variant === 'default' && 'glass',
        variant === 'strong' && 'glass-strong',
        hover && 'transition-all duration-150 hover:shadow-glass-hover',
        className
      )}
    >
      {children}
    </div>
  );
};

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  subtitle,
  actions,
  className,
}) => {
  return (
    <div className={clsx('flex items-center justify-between px-4 py-3 border-b border-panel-border', className)}>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-DEFAULT">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};

interface PanelBodyProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const PanelBody: React.FC<PanelBodyProps> = ({
  children,
  className,
  padding = 'md',
}) => {
  const paddingClass = {
    none: '',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
  }[padding];

  return <div className={clsx(paddingClass, className)}>{children}</div>;
};
