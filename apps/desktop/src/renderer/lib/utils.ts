import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

export const basename = (file: string): string => file.slice(file.lastIndexOf('/') + 1);
export const dirname = (file: string): string => {
  const idx = file.lastIndexOf('/');
  return idx < 0 ? '' : file.slice(0, idx);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

export const relativeTime = (time: number | string): string => {
  const ms = Date.now() - new Date(time).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;
  return `${Math.round(hours / 24)} 日前`;
};
