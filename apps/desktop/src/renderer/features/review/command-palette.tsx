import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { COMMAND_TITLES, DEFAULT_KEYBINDINGS, formatChord, type CommandId } from '@/keymap/keymap';
import { useReviewStore } from '@/stores/review';

/** Cmd+Shift+P：すべてのコマンドを割り当てキーとともに表示する（docs/specs/09） */
export function CommandPalette({ run }: { run: (command: CommandId) => void }) {
  const open = useReviewStore((s) => s.palette);
  const setOpen = useReviewStore((s) => s.setPalette);
  const commands = (Object.keys(COMMAND_TITLES) as CommandId[]).filter(
    (c) => c !== 'workbench.commandPalette',
  );
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="コマンドパレット">
      <CommandInput placeholder="コマンドを検索" />
      <CommandList>
        <CommandEmpty>見つかりません</CommandEmpty>
        <CommandGroup>
          {commands.map((command) => (
            <CommandItem
              key={command}
              value={`${COMMAND_TITLES[command]} ${command}`}
              onSelect={() => {
                setOpen(false);
                // ダイアログが閉じてから実行する（フォーカスを戻すため）
                setTimeout(() => run(command), 0);
              }}
            >
              {COMMAND_TITLES[command]}
              <CommandShortcut>{DEFAULT_KEYBINDINGS[command].map(formatChord).join(' ')}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
