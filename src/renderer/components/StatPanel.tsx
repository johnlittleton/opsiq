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
        'glass rounded-sm p-4 border transition-all duration-150 hover:shadow-glass-hover',
        variantClasses[variant],
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-text-muted font-medium">
          {title}
        </div>
        {icon && <div className="text-text-subtle">{icon}</div>}
      </div>
      
      <div className="flex items-baseline gap-2 mb-1">
        <div className={clsx('text-3xl font-bold', valueColorClasses[variant])}>
          {value}
        </div>
        {unit && (
          <div className="text-sm text-text-muted">{unit}</div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center gap-2 text-xs">
          {trend && (
            <div className={clsx('flex items-center gap-1', trendColor)}>
              <TrendIcon size={12} />
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
