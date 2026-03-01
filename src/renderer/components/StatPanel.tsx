import React from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatPanelProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  icon?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export const StatPanel: React.FC<StatPanelProps> = ({
  title,
  value,
  unit,
  subtitle,
  trend,
  trendValue,
  variant = 'default',
  icon,
  className,
  compact = false,
}) => {
  const variantClasses = {
    default: 'border-panel-border',
    blue: 'border-accent-blue/30 bg-accent-blue/5',
    green: 'border-accent-green/30 bg-accent-green/5',
    yellow: 'border-accent-yellow/30 bg-accent-yellow/5',
    red: 'border-accent-red/30 bg-accent-red/5',
    purple: 'border-accent-purple/30 bg-accent-purple/5',
  };

  const valueColorClasses = {
    default: 'text-text-DEFAULT',
    blue: 'text-accent-blue',
    green: 'text-accent-green',
    yellow: 'text-accent-yellow',
    red: 'text-accent-red',
    purple: 'text-accent-purple',
  };

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-accent-green' : trend === 'down' ? 'text-accent-red' : 'text-text-muted';

  return (
    <div
      className={clsx(
        'glass rounded-sm border transition-all duration-150 hover:shadow-glass-hover',
        compact ? 'p-2' : 'p-4',
        variantClasses[variant],
        className
      )}
    >
      <div className={clsx('flex items-start justify-between', compact ? 'mb-1' : 'mb-2')}>
        <div className={clsx('uppercase tracking-wide text-text-muted font-medium', compact ? 'text-[9px]' : 'text-xs')}>
          {title}
        </div>
        {icon && <div className="text-text-subtle">{icon}</div>}
      </div>
      
      <div className={clsx('flex items-baseline gap-2', compact ? 'mb-0' : 'mb-1')}>
        <div className={clsx('font-bold', compact ? 'text-lg' : 'text-3xl', valueColorClasses[variant])}>
          {value}
        </div>
        {unit && (
          <div className={clsx('text-text-muted', compact ? 'text-xs' : 'text-sm')}>{unit}</div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className={clsx('flex items-center gap-2', compact ? 'text-[9px]' : 'text-xs')}>
          {trend && (
            <div className={clsx('flex items-center gap-1', trendColor)}>
              <TrendIcon size={compact ? 10 : 12} />
              {trendValue && <span>{trendValue}</span>}
            </div>
          )}
          {subtitle && (
            <div className="text-text-subtle">{subtitle}</div>
          )}
        </div>
      )}
    </div>
  );
};
