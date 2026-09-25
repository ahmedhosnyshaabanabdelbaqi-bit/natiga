import { Module } from '@nestjs/common';
import { AdminTagsController, TagsController } from './tags.controller';
import { TagsService } from './tags.service';

/**
 * Article tags (+ ar/en names):
 *   GET /api/v1/tags[/:slug]                  public (tags of visible articles, ETag)
 *   /api/v1/admin/tags[/:id][/merge]           read: tags.write | articles.read; write: tags.write
 */
@Module({
  controllers: [TagsController, AdminTagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
