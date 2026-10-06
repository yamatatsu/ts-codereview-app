import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

/** バリデーション失敗も AppError（validation.invalid）として返す */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            type: 'validation.invalid' as const,
            message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
          },
        },
        400,
      );
    }
    return undefined;
  });
