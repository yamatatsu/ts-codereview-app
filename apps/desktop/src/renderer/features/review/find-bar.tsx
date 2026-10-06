import { ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useReviewStore } from '@/stores/review';

const find = (text: string, forward = true, stop = false) =>
  void api.find.$post({ json: { text, forward, stop } }).catch(() => undefined);

/** Cmd+F：Electron の findInPage でページ内を検索する（docs/specs/09） */
export function FindBar() {
  const open = useReviewStore((s) => s.findOpen);
  const setOpen = useReviewStore((s) => s.setFindOpen);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) ref.current?.select();
  }, [open]);

  if (!open) return null;
  const close = () => {
    find('', true, true);
    setOpen(false);
  };
  return (
    <div className="absolute top-2 right-4 z-40 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-lg">
      <Input
        ref={ref}
        autoFocus
        value={text}
        placeholder="検索"
        className="h-7 w-56"
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value) find(e.target.value);
          else find('', true, true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') find(text, !e.shiftKey);
          if (e.key === 'Escape') close();
        }}
      />
      <Button variant="ghost" size="icon-sm" aria-label="前を検索" onClick={() => find(text, false)}>
        <ChevronUpIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="次を検索" onClick={() => find(text, true)}>
        <ChevronDownIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="閉じる" onClick={close}>
        <XIcon />
      </Button>
    </div>
  );
}
