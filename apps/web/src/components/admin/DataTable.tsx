'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui/Display';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

/** Horizontally-scrollable table with loading / empty / error states and optional pagination. */
export function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  rowKey,
  rowHref,
  onRowClick,
  empty = 'Nothing to show',
  emptyDescription,
  page,
  totalPages,
  total,
  onPage,
  className,
  footer,
}: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
  emptyDescription?: string;
  page?: number;
  totalPages?: number;
  total?: number;
  onPage?: (p: number) => void;
  className?: string;
  footer?: ReactNode;
}) {
  const router = useRouter();
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  const showSkeleton = loading && !rows?.length;
  const clickable = !!rowHref || !!onRowClick;
  return (
    <div className={className}>
      <div className="card overflow-hidden">
        <div className="scrollbar-thin overflow-x-auto">
          <table className={clsx('table-base', loading && rows?.length ? 'opacity-60' : '')}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={clsx(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showSkeleton &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!showSkeleton &&
                rows?.map((r) => (
                  <tr
                    key={rowKey(r)}
                    className={clsx(clickable && 'cursor-pointer')}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button,input,select,label,textarea')) return;
                      if (onRowClick) onRowClick(r);
                      else if (rowHref) router.push(rowHref(r));
                    }}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={clsx(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!loading && rows && rows.length === 0 && (
          <div className="p-4">
            <EmptyState title={empty} description={emptyDescription} />
          </div>
        )}
        {footer}
      </div>
      {page != null && totalPages != null && onPage && <Pagination page={page} totalPages={totalPages} total={total} onChange={onPage} />}
    </div>
  );
}
