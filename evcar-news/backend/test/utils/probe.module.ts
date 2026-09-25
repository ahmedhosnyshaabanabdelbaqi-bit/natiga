import { Body, Controller, Get, HttpStatus, Module, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequestContext } from '../../src/common/context/request-context';
import { AppException } from '../../src/common/errors/app.exception';
import { ok } from '../../src/common/http/responses';
import { PaginationQueryDto, toPageRequest } from '../../src/common/http/pagination';
import { paginated } from '../../src/common/http/responses';
import { Lang, Market } from '../../src/common/i18n/request-locale';
import { RateLimit } from '../../src/common/throttle/rate-limit.decorator';
import { Public } from '../../src/modules/auth/decorators/public.decorator';
import { PrismaService } from '../../src/prisma/prisma.service';

class AddressDto {
  @IsString() @MaxLength(50) city!: string;
}

class EchoDto {
  @IsEmail() email!: string;
  @IsInt() @Min(1) @Max(10) count!: number;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) address?: AddressDto;
}

/** Test-only controller exercising the foundation (never part of the app). */
@Public()
@Controller('__probe')
class ProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('echo')
  echo(@Body() body: EchoDto) {
    return ok({ ...body, isInstance: body instanceof EchoDto });
  }

  @Get('locale')
  locale(@Lang() lang: string, @Market() market: string) {
    return ok({
      lang,
      market,
      contextRequestId: RequestContext.requestId(),
      contextLang: RequestContext.get()?.lang,
    });
  }

  @Get('app-error')
  appError() {
    throw new AppException({
      status: HttpStatus.CONFLICT,
      code: 'ARTICLE_NOT_PUBLISHABLE',
      message: { ar: 'لا يمكن نشر المادة.', en: 'The article cannot be published.' },
      details: { missing: ['cover'] },
    });
  }

  @Get('not-configured')
  notConfigured() {
    throw AppException.integrationNotConfigured('routing');
  }

  @Get('crash')
  crash() {
    throw new Error('secret internal detail: password=hunter2');
  }

  @Get('unique-violation')
  async uniqueViolation() {
    await this.prisma.currency.create({ data: { code: 'EGP', nameAr: 'x', nameEn: 'x' } });
    return ok(true);
  }

  @Get('paged')
  paged(@Query() query: PaginationQueryDto) {
    const page = toPageRequest(query);
    const all = Array.from({ length: 45 }, (_, i) => i + 1);
    return paginated(all.slice(page.skip, page.skip + page.take), all.length, page);
  }

  @Get('limited')
  @RateLimit('auth')
  limited() {
    return ok(true);
  }
}

/** Mimics a share-module route served outside the /api/v1 prefix. */
@Public()
@Controller()
class ProbeShareController {
  @Get('n/:slug')
  page(@Lang() lang: string, @Market() market: string) {
    return ok({ lang, market });
  }
}

@Module({ controllers: [ProbeController, ProbeShareController] })
export class ProbeModule {}
