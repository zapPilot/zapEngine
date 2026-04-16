import { z } from "zod";

/**
 * Creates a typed validator function from a Zod schema.
 *
 * @param schema - Zod schema to wrap
 * @returns A function that parses unknown data through the schema
 *
 * @example
 * ```typescript
 * const validateUser = createValidator(userSchema);
 * const user = validateUser(apiResponse); // typed as User
 * ```
 */
export function createValidator<T>(
  schema: z.ZodSchema<T>
): (data: unknown) => T {
  return function validate(data: unknown): T {
    return schema.parse(data);
  };
}
