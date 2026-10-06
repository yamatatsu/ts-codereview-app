import type * as React from 'react';

import { cn } from '@/lib/utils';

/** ネイティブの select を shadcn 風に整えたもの */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 rounded-md border border-input bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
