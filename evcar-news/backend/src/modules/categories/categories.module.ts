import { Module } from '@nestjs/common';
import { AdminCategoriesController, CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/**
 * News categories (+ ar/en translations):
 *   GET /api/v1/categories[/:slug]            public (active only, ETag)
 *   /api/v1/admin/categories[/:id]             read: categories.write | articles.read; write: categories.write
 * See docs/decisions/backend-articles.md.
 */
@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
