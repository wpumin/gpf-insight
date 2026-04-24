import React from 'react';
import clsx from 'clsx';

interface ShimmerProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export const Shimmer: React.FC<ShimmerProps> = ({ className, variant = 'rect' }) => {
  return (
    <div className={clsx(
      "animate-pulse bg-slate-200 dark:bg-slate-800",
      variant === 'circle' && "rounded-full",
      variant === 'rect' && "rounded-xl",
      variant === 'text' && "rounded h-4 w-3/4",
      className
    )} />
  );
};

export const CardShimmer = () => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 space-y-4">
    <div className="flex items-center gap-3">
      <Shimmer variant="circle" className="w-10 h-10" />
      <div className="space-y-2 flex-grow">
        <Shimmer variant="text" className="w-1/3" />
        <Shimmer variant="text" className="w-1/2 h-3" />
      </div>
    </div>
    <Shimmer className="h-40 w-full" />
    <div className="grid grid-cols-2 gap-4">
      <Shimmer className="h-16" />
      <Shimmer className="h-16" />
    </div>
  </div>
);
