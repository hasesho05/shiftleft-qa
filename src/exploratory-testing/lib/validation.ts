import * as v from "valibot";

type CompatibleSafeParseResult<TSchema extends v.GenericSchema> =
  | {
      readonly success: true;
      readonly data: v.InferOutput<TSchema>;
      readonly error?: undefined;
    }
  | {
      readonly success: false;
      readonly data?: undefined;
      readonly error: v.ValiError<TSchema>;
    };

export type SchemaWithMethods<TSchema extends v.GenericSchema> = TSchema & {
  readonly parse: (input: unknown) => v.InferOutput<TSchema>;
  readonly safeParse: (input: unknown) => CompatibleSafeParseResult<TSchema>;
};

export function schema<TSchema extends v.GenericSchema>(
  baseSchema: TSchema,
): SchemaWithMethods<TSchema> {
  return Object.assign(baseSchema, {
    parse(input: unknown): v.InferOutput<TSchema> {
      return v.parse(baseSchema, input);
    },
    safeParse(input: unknown): CompatibleSafeParseResult<TSchema> {
      const result = v.safeParse(baseSchema, input);

      if (result.success) {
        return { success: true as const, data: result.output };
      }

      return {
        success: false as const,
        error: new v.ValiError(result.issues),
      };
    },
  });
}

export const nonEmptyString = () => v.pipe(v.string(), v.minLength(1));
export const nonNegativeInteger = () =>
  v.pipe(v.number(), v.integer(), v.minValue(0));
export const positiveInteger = () =>
  v.pipe(v.number(), v.integer(), v.minValue(1));
export const unitInterval = () =>
  v.pipe(v.number(), v.minValue(0), v.maxValue(1));

export { v };
