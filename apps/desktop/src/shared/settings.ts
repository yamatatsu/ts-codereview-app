import { z } from 'zod';

export const executablesSchema = z.object({
  git: z.string().optional(),
  node: z.string().optional(),
  pnpm: z.string().optional(),
  npm: z.string().optional(),
  yarn: z.string().optional(),
  code: z.string().optional(),
  cursor: z.string().optional(),
});

export const settingsSchema = z.object({
  executables: executablesSchema.default({}),
  diffLayout: z.enum(['split', 'unified']).default('split'),
  defaultCollapsedGlobs: z.array(z.string()).optional(),
  defaultTestGlobs: z.array(z.string()).optional(),
  externalEditor: z.enum(['code', 'cursor']).default('code'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  worktreeStaleDays: z.number().int().positive().default(14),
  onboardingCompleted: z.boolean().default(false),
});

export type Settings = z.infer<typeof settingsSchema>;
export type ExecutablesSettings = z.infer<typeof executablesSchema>;

export const settingsPatchSchema = settingsSchema.partial();
