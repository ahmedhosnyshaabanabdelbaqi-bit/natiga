import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { Public } from '../../modules/auth';
import { STORAGE_PROVIDER } from '../provider-tokens';
import { verifyLocal } from './local-signed-url';
import { LOCAL_SIGNED_ROUTE, LocalStorageProvider } from './local-storage.provider';
import { assertValidKey, InvalidStorageKeyError } from './storage-keys';
import { StorageObjectNotFoundError, type StorageProvider } from './storage.types';

function keyFromParam(raw: string | string[] | undefined): string {
  const joined = Array.isArray(raw) ? raw.join('/') : (raw ?? '');
  try {
    return assertValidKey(decodeURIComponent(joined));
  } catch {
    throw AppException.notFound();
  }
}

/**
 * Serves HMAC-signed URLs of the local storage driver (the S3 presigned URL
 * equivalent). Only active with STORAGE_DRIVER=local; the signature binds
 * method, key, expiry and content type / download name.
 */
@ApiExcludeController()
@Public()
@Controller(LOCAL_SIGNED_ROUTE)
export class LocalFilesController {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly config: AppConfig,
  ) {}

  private local(): LocalStorageProvider {
    if (!(this.storage instanceof LocalStorageProvider)) throw AppException.notFound();
    return this.storage;
  }

  private verify(
    method: 'GET' | 'PUT',
    key: string,
    q: Record<string, string | undefined>,
  ): void {
    const exp = Number(q.exp);
    const result = verifyLocal(
      this.local().urlSigningKey,
      {
        method,
        key,
        exp,
        contentType: method === 'PUT' ? q.ct : undefined,
        downloadName: method === 'GET' ? q.dn : undefined,
      },
      q.sig ?? '',
    );
    if (result === 'expired') {
      throw new AppException({ status: HttpStatus.GONE, code: ErrorCode.GONE });
    }
    if (result !== 'ok') throw AppException.forbidden();
  }

  @Get('*key')
  async download(
    @Param('key') rawKey: string | string[],
    @Query() q: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const key = keyFromParam(rawKey);
    this.verify('GET', key, q);
    let opened;
    try {
      opened = await this.local().get(key);
    } catch (err) {
      if (err instanceof StorageObjectNotFoundError || err instanceof InvalidStorageKeyError) {
        throw AppException.notFound();
      }
      throw err;
    }
    const { stream, info } = opened;
    res.setHeader('Content-Type', info.contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=60');
    if (q.dn) {
      const safe = q.dn.replace(/[^\x20-\x7e]|["\\]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(q.dn)}`,
      );
    } else if (info.contentDisposition) {
      res.setHeader('Content-Disposition', info.contentDisposition);
    }
    await pipeline(stream, res);
  }

  @Put('*key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(
    @Param('key') rawKey: string | string[],
    @Query() q: Record<string, string | undefined>,
    @Req() req: Request,
  ): Promise<void> {
    const key = keyFromParam(rawKey);
    this.verify('PUT', key, q);
    const contentType = req.headers['content-type'];
    if (q.ct && contentType !== q.ct) {
      throw new AppException({
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        details: { expected: q.ct },
      });
    }
    const max = this.config.storage.uploadMaxBytes;
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max) {
      throw new AppException({ status: 413, code: ErrorCode.PAYLOAD_TOO_LARGE });
    }
    // express.raw() may already have buffered octet-stream bodies (<= chunk limit).
    const body: unknown = req.body;
    if (Buffer.isBuffer(body)) {
      await this.local().put(key, body, { contentType: q.ct });
      return;
    }
    try {
      // Lazy generator: the request stays paused until put() starts reading (no lost chunks).
      await this.local().put(key, Readable.from(limitBytes(req, max)), { contentType: q.ct });
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        throw new AppException({ status: 413, code: ErrorCode.PAYLOAD_TOO_LARGE });
      }
      throw err;
    }
  }
}

class PayloadTooLargeError extends Error {}

async function* limitBytes(source: AsyncIterable<Buffer>, max: number): AsyncGenerator<Buffer> {
  let size = 0;
  for await (const chunk of source) {
    size += chunk.length;
    if (size > max) throw new PayloadTooLargeError();
    yield chunk;
  }
}
