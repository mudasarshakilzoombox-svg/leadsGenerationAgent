import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validate a request part with a shared contract schema:
 * `@Body(new ZodValidationPipe(CreateThingSchema)) body: CreateThing`.
 * A ZodError becomes `400 VALIDATION_FAILED` with field pointers (see toProblem).
 */
@Injectable()
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    return this.schema.parse(value);
  }
}
