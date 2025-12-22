import React from 'react';
import { clsx } from 'clsx';
import { GlassPanel, PanelHeader, PanelBody } from './GlassPanel';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface TablePanelProps<T> {
  title?: string;
  subtitle?: string;
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  maxHeight?: string;
  className?: string;
  actions?: React.ReactNode;
}

export function TablePanel<T extends Record<string, any>>({
  title,
  subtitle,
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  maxHeight = '600px',
  className,
  actions,
}: TablePanelProps<T>) {
  return (
    <GlassPanel className={className}>
      {title && <PanelHeader title={title} subtitle={subtitle} actions={actions} />}
      <PanelBody padding="none">
        <div className="overflow-auto" style={{ maxHeight }}>
          <table className="w-full">
            <thead className="sticky top-0 bg-background-tertiary border-b border-panel-border">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted',
                      col.className
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-sm text-text-subtle"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, index) => (
                  <tr
                    key={keyExtractor(row, index)}
                    onClick={() => onRowClick?.(row)}
                    className={clsx(
                      'border-b border-panel-border/50 transition-colors duration-100',
                      'hover:bg-panel-hover',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={clsx(
                          'px-4 py-3 text-sm text-text-DEFAULT',
                          col.className
                        )}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
