import { Injectable, type PipeTransform } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts any UUID version (ids are v7); anything else is a 404 (no DB round trip). */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) throw AppException.notFound();
    return value.toLowerCase();
  }
}
