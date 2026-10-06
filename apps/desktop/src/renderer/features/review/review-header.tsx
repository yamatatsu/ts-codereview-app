import { Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  NetworkIcon,
  PanelLeftIcon,
  PanelRightIcon,
  RefreshCwIcon,
  TerminalSquareIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatChord, DEFAULT_KEYBINDINGS, COMMAND_TITLES, type CommandId } from '@/keymap/keymap';
import { useProjects } from '@/lib/queries';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';

export const describeTarget = (target: TargetDto): string => {
  switch (target.target.kind) {
    case 'local-worktree':
      return '未コミットの変更';
    case 'local-branch':
      return `${target.target.branch} ← ${target.target.baseBranch}`;
    case 'pr':
      return `#${target.target.number} ${target.pr?.title ?? ''}`;
  }
};

function IconCommand({
  command,
  icon,
  run,
  disabled,
}: {
  command: CommandId;
  icon: React.ReactNode;
  run: (c: CommandId) => void;
  disabled?: boolean;
}) {
  const keys = DEFAULT_KEYBINDINGS[command].map(formatChord).join(' ');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => run(command)}
          disabled={disabled}
          aria-label={COMMAND_TITLES[command]}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {COMMAND_TITLES[command]} {keys && <span className="ml-1 opacity-70">{keys}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function ReviewHeader({
  target,
  run,
}: {
  target: TargetDto | undefined;
  run: (c: CommandId) => void;
}) {
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === target?.target.projectId);
  const canBack = useReviewStore((s) => s.back.length > 0);
  const canForward = useReviewStore((s) => s.forward.length > 0);

  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-1 border-b bg-sidebar pr-2 pl-20">
      <div className="app-no-drag flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" aria-label="プロジェクト一覧">
          <Link to="/">
            <ChevronLeftIcon />
          </Link>
        </Button>
        <IconCommand command="nav.back" icon={<ArrowLeftIcon />} run={run} disabled={!canBack} />
        <IconCommand command="nav.forward" icon={<ArrowRightIcon />} run={run} disabled={!canForward} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <span className="font-semibold">{project?.name}</span>
        {target && (
          <span className="flex min-w-0 items-center gap-1 truncate text-muted-foreground">
            {target.target.kind === 'pr' && <GitPullRequestIcon className="size-3.5 shrink-0 text-added" />}
            <span className="truncate">{describeTarget(target)}</span>
          </span>
        )}
        {target?.pr && (
          <Button
            variant="link"
            size="sm"
            className="app-no-drag h-auto p-0 text-xs"
            onClick={() => window.open(target.pr?.htmlUrl, '_blank')}
          >
            GitHub <ExternalLinkIcon className="size-3" />
          </Button>
        )}
      </div>
      <div className="app-no-drag flex items-center gap-0.5">
        <IconCommand command="review.refresh" icon={<RefreshCwIcon />} run={run} />
        <IconCommand command="graph.open" icon={<NetworkIcon />} run={run} />
        <IconCommand command="editor.openExternal" icon={<TerminalSquareIcon />} run={run} />
        <IconCommand command="view.toggleSidebar" icon={<PanelLeftIcon />} run={run} />
        <IconCommand command="view.togglePanel" icon={<PanelRightIcon />} run={run} />
      </div>
    </header>
  );
}
