import React from 'react';
import GaugeComponent from 'react-gauge-component';
import { GlassPanel, PanelHeader, PanelBody } from './GlassPanel';

interface RadialGaugePanelProps {
  title: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  thresholds?: {
    green: number;
    yellow: number;
    red: number;
  };
  target?: number;
  subtitle?: string;
  className?: string;
}

export const RadialGaugePanel: React.FC<RadialGaugePanelProps> = ({
  title,
  value,
  min = 0,
  max = 100,
  unit = '%',
  thresholds = { green: 70, yellow: 40, red: 0 },
  target,
  subtitle,
  className,
}) => {
  // Calculate arc segments based on thresholds
  const segments = [
    {
      limit: thresholds.yellow,
      color: '#dc3545',
      showTick: true,
    },
    {
      limit: thresholds.green,
      color: '#fade2a',
      showTick: true,
    },
    {
      limit: max,
      color: '#73bf69',
      showTick: true,
    },
  ];

  return (
    <GlassPanel className={className} hover>
      <PanelHeader title={title} subtitle={subtitle} />
      <PanelBody className="flex flex-col items-center py-6">
        <div className="w-full max-w-[240px]">
          <GaugeComponent
            type="radial"
            value={value}
            minValue={min}
            maxValue={max}
            arc={{
              colorArray: ['#dc3545', '#fade2a', '#73bf69'],
              subArcs: segments,
              padding: 0.02,
              width: 0.15,
            }}
            pointer={{
              elastic: true,
              animationDelay: 0,
              color: '#52a8ff',
              length: 0.65,
              width: 12,
            }}
            labels={{
              valueLabel: {
                formatTextValue: (val) => `${val}${unit}`,
                style: {
                  fontSize: '32px',
                  fill: '#d8d9da',
                  fontWeight: 'bold',
                },
              },
              tickLabels: {
                type: 'outer',
                ticks: [
                  { value: min },
                  { value: thresholds.yellow },
                  { value: thresholds.green },
                  { value: max },
                ],
                defaultTickValueConfig: {
                  style: { fontSize: '10px', fill: '#9fa0a3' },
                },
              },
            }}
          />
        </div>
        {target !== undefined && (
          <div className="mt-4 text-center">
            <div className="text-xs text-text-muted">Target: <span className="text-accent-blue font-semibold">{target}{unit}</span></div>
          </div>
        )}
      </PanelBody>
    </GlassPanel>
  );
};

interface BarGaugePanelProps {
  title: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  thresholds?: {
    green: number;
    yellow: number;
    red: number;
  };
  target?: number;
  subtitle?: string;
  className?: string;
}

export const BarGaugePanel: React.FC<BarGaugePanelProps> = ({
  title,
  value,
  min = 0,
  max = 100,
  unit = '',
  thresholds = { green: 70, yellow: 40, red: 0 },
  target,
  subtitle,
  className,
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  
  // Determine color based on value
  let barColor = '#dc3545'; // red
  if (value >= thresholds.green) {
    barColor = '#73bf69'; // green
  } else if (value >= thresholds.yellow) {
    barColor = '#fade2a'; // yellow
  }

  return (
    <GlassPanel className={className} hover>
      <PanelHeader title={title} subtitle={subtitle} />
      <PanelBody>
        <div className="flex items-center justify-between mb-2">
          <div className="text-3xl font-bold" style={{ color: barColor }}>
            {value}{unit}
          </div>
          {target !== undefined && (
            <div className="text-xs text-text-muted">
              Target: <span className="text-accent-blue font-semibold">{target}{unit}</span>
            </div>
          )}
        </div>
        
        <div className="relative w-full h-8 bg-background-tertiary rounded-sm overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full transition-all duration-500 rounded-sm"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: barColor,
              boxShadow: `0 0 12px ${barColor}66`,
            }}
          />
          {target !== undefined && (
            <div
              className="absolute top-0 h-full w-0.5 bg-accent-blue"
              style={{
                left: `${((target - min) / (max - min)) * 100}%`,
              }}
            />
          )}
        </div>
        
        <div className="flex justify-between mt-2 text-xs text-text-subtle">
          <span>{min}</span>
          <span>{max}{unit}</span>
        </div>
      </PanelBody>
    </GlassPanel>
  );
};
