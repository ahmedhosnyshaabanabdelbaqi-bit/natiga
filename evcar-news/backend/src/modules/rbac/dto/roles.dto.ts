import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, Matches } from 'class-validator';

export class RoleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'editor' }) key!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Effective permission keys (the owner role always has all of them).',
  })
  permissions!: string[];
  @ApiProperty({ description: 'False for the owner role (always every permission).' })
  permissionsEditable!: boolean;
  @ApiProperty() userCount!: number;
}

export class PermissionDto {
  @ApiProperty({ example: 'articles.publish' }) key!: string;
  @ApiProperty({ example: 'articles' }) group!: string;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String], example: ['articles.read', 'articles.create'] })
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    each: true,
    message: 'each permission must be a permission key',
  })
  permissions!: string[];
}
