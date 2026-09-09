import { z } from 'zod';

export const sentryInspectionOptionsSchema = z
  .object({
    start: z.iso.datetime({ offset: true }).optional(),
    end: z.iso.datetime({ offset: true }).optional(),
    cursor: z.string().min(1).optional(),
    query: z.string().optional(),
  })
  .superRefine((value, context) => {
    if ((value.start === undefined) !== (value.end === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'start and end must be supplied together.',
      });
    } else if (
      value.start &&
      value.end &&
      Date.parse(value.start) >= Date.parse(value.end)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'start must be earlier than end.',
      });
    }
  });

export type SentryInspectionOptions = z.infer<
  typeof sentryInspectionOptionsSchema
>;
