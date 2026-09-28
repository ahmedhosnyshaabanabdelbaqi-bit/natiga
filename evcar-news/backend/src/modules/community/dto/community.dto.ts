import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { CONTENT_REPORT_REASONS, RATING_DIMENSIONS, type RatingDimension } from '../common/labels';
import { CleanMultiline, IsUuidField, QueryBool } from './validators';

export const LOCALES = ['ar', 'en'] as const;
export const REVIEW_TARGETS = ['variant', 'station'] as const;
export const COMMENT_TARGETS = ['article', 'review', 'model', 'variant'] as const;
export const QUESTION_TARGETS = ['model', 'variant', 'station'] as const;
export const VOTE_TARGETS = ['review', 'comment', 'question', 'answer'] as const;
export const REPORT_TARGETS = ['review', 'comment', 'question', 'answer', 'user'] as const;
export const CONTENT_TYPES = ['review', 'comment', 'question', 'answer'] as const;
export const MODERATION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const;

export type CommentTarget = (typeof COMMENT_TARGETS)[number];
export type QuestionTarget = (typeof QUESTION_TARGETS)[number];
export type VoteTarget = (typeof VOTE_TARGETS)[number];
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];

// --- shared response parts ------------------------------------------------------------------

export class AuthorDto {
  @ApiProperty({ type: String, nullable: true, description: 'NULL when the account was deleted.' })
  id!: string | null;
  @ApiProperty({ description: 'Localized "Deleted user" when the account was deleted.' })
  displayName!: string;
  @ApiProperty() isDeleted!: boolean;
}

export class VotesDto {
  @ApiProperty() up!: number;
  @ApiProperty() down!: number;
  @ApiProperty({ description: 'up - down' }) score!: number;
  @ApiProperty({
    enum: [1, -1],
    nullable: true,
    description: "The caller's vote (null for guests).",
  })
  myVote!: 1 | -1 | null;
}

export class TargetRefDto {
  @ApiProperty() type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
}

// --- reviews -----------------------------------------------------------------------------------

export class DimensionScoreDto {
  @ApiProperty({ enum: RATING_DIMENSIONS })
  @IsIn(RATING_DIMENSIONS)
  dimension!: RatingDimension;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;
}

export class CreateReviewDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Exactly one of variantId / stationId.' })
  @IsOptional()
  @IsUuidField()
  variantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  stationId?: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Overall rating.' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @Length(3, 200)
  title?: string;

  @ApiProperty({ minLength: 20, maxLength: 5000 })
  @CleanMultiline()
  @IsString()
  @Length(20, 5000)
  body!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @MaxLength(2000)
  pros?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @MaxLength(2000)
  cons?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 600,
    description: 'How long the author owned / used the car.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  ownershipMonths?: number;

  @ApiPropertyOptional({
    type: [DimensionScoreDto],
    description: 'Optional 1..5 scores. Car dimensions for variants, station_* for stations.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => DimensionScoreDto)
  ratings?: DimensionScoreDto[];

  @ApiPropertyOptional({
    enum: LOCALES,
    description: 'Language of the text (default: request language).',
  })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: 'ar' | 'en';
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @CleanText()
  @IsString()
  @Length(3, 200)
  title?: string | null;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanMultiline()
  @IsString()
  @Length(20, 5000)
  body?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @MaxLength(2000)
  pros?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @MaxLength(2000)
  cons?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  ownershipMonths?: number | null;

  @ApiPropertyOptional({ type: [DimensionScoreDto], description: 'Replaces all dimension scores.' })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => DimensionScoreDto)
  ratings?: DimensionScoreDto[];
}

export const REVIEW_SORTS = ['recent', 'helpful', 'rating_high', 'rating_low'] as const;

export class ReviewListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Exactly one of variantId / stationId.' })
  @IsOptional()
  @IsUuidField()
  variantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  stationId?: string;

  @ApiPropertyOptional({ enum: REVIEW_SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort?: (typeof REVIEW_SORTS)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Only this overall rating.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Only reviews carrying the verified-owner badge.' })
  @QueryBool()
  verifiedOnly?: boolean;
}

export class ReviewSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  variantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUuidField()
  stationId?: string;
}

export class DimensionScoreViewDto {
  @ApiProperty({ enum: RATING_DIMENSIONS }) dimension!: string;
  @ApiProperty() label!: string;
  @ApiProperty() score!: number;
}

export class ReviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: TargetRefDto, description: 'type: variant | station' })
  target!: TargetRefDto;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, nullable: true }) pros!: string | null;
  @ApiProperty({ type: String, nullable: true }) cons!: string | null;
  @ApiProperty({ type: Number, nullable: true }) ownershipMonths!: number | null;
  @ApiProperty({ type: [DimensionScoreViewDto] }) ratings!: DimensionScoreViewDto[];
  @ApiProperty({ type: AuthorDto }) author!: AuthorDto;
  @ApiProperty({
    description:
      'True only when backed by an approved, unexpired owner verification of the author for this variant.',
  })
  verifiedOwner!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Localized badge text when verifiedOwner.',
  })
  verifiedOwnerLabel!: string | null;
  @ApiProperty() locale!: string;
  @ApiProperty({ type: String, nullable: true }) marketCode!: string | null;
  @ApiProperty({ type: VotesDto }) votes!: VotesDto;
  @ApiProperty({ description: 'Visible comments on the review.' }) commentCount!: number;
  @ApiProperty({ enum: MODERATION_STATUSES }) status!: string;
  @ApiProperty() isMine!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class RatingBucketDto {
  @ApiProperty() rating!: number;
  @ApiProperty() count!: number;
}

export class DimensionAverageDto {
  @ApiProperty() dimension!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: Number, nullable: true }) average!: number | null;
  @ApiProperty() count!: number;
}

export class ReviewSummaryDto {
  @ApiProperty({ type: TargetRefDto }) target!: TargetRefDto;
  @ApiProperty() count!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'NULL when there are no reviews (never 0).',
  })
  average!: number | null;
  @ApiProperty({ type: [RatingBucketDto], description: '5 → 1' }) distribution!: RatingBucketDto[];
  @ApiProperty() verifiedOwnerCount!: number;
  @ApiProperty({ type: [DimensionAverageDto] }) dimensions!: DimensionAverageDto[];
}

// --- comments ----------------------------------------------------------------------------------

export class CreateCommentDto {
  @ApiProperty({ enum: COMMENT_TARGETS })
  @IsIn(COMMENT_TARGETS)
  targetType!: CommentTarget;

  @ApiProperty({ format: 'uuid' })
  @IsUuidField()
  targetId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Reply to this comment (same target; one level).',
  })
  @IsOptional()
  @IsUuidField()
  parentId?: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @CleanMultiline()
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export class UpdateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @CleanMultiline()
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export const COMMENT_SORTS = ['oldest', 'newest', 'top'] as const;

export class CommentListQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: COMMENT_TARGETS })
  @IsIn(COMMENT_TARGETS)
  targetType!: CommentTarget;

  @ApiProperty({ format: 'uuid' })
  @IsUuidField()
  targetId!: string;

  @ApiPropertyOptional({ enum: COMMENT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(COMMENT_SORTS)
  sort?: (typeof COMMENT_SORTS)[number];
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: TargetRefDto, description: 'type: article | review | model | variant' })
  target!: TargetRefDto;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty({ type: AuthorDto }) author!: AuthorDto;
  @ApiProperty({ type: VotesDto }) votes!: VotesDto;
  @ApiProperty({ enum: MODERATION_STATUSES }) status!: string;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ description: 'Visible replies (top-level comments only).' }) replyCount!: number;
  @ApiProperty({
    type: () => [CommentDto],
    description: 'First visible replies, oldest first (top-level comments in lists only).',
  })
  replies!: CommentDto[];
  @ApiProperty({ type: String, nullable: true }) editedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

// --- questions & answers ------------------------------------------------------------------

export class CreateQuestionDto {
  @ApiPropertyOptional({ enum: QUESTION_TARGETS, description: 'Omit for a general question.' })
  @IsOptional()
  @IsIn(QUESTION_TARGETS)
  targetType?: QuestionTarget;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required with targetType.' })
  @ValidateIf((o: CreateQuestionDto) => o.targetType !== undefined || o.targetId !== undefined)
  @IsUuidField()
  targetId?: string;

  @ApiProperty({ minLength: 10, maxLength: 300 })
  @CleanText()
  @IsString()
  @Length(10, 300)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: 'ar' | 'en';
}

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  @OptionalNotNull()
  @CleanText()
  @IsString()
  @Length(10, 300)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @MaxLength(5000)
  body?: string | null;
}

export const QUESTION_SORTS = ['recent', 'votes', 'active'] as const;

export class QuestionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QUESTION_TARGETS })
  @IsOptional()
  @IsIn(QUESTION_TARGETS)
  targetType?: QuestionTarget;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: QuestionListQueryDto) => o.targetType !== undefined || o.targetId !== undefined)
  @IsUuidField()
  targetId?: string;

  @ApiPropertyOptional({
    description: 'true = has an accepted or visible answer; false = unanswered.',
  })
  @QueryBool()
  answered?: boolean;

  @ApiPropertyOptional({ maxLength: 100, description: 'Text search in titles.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @Length(2, 100)
  q?: string;

  @ApiPropertyOptional({ enum: QUESTION_SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(QUESTION_SORTS)
  sort?: (typeof QUESTION_SORTS)[number];
}

export class CreateAnswerDto {
  @ApiProperty({ minLength: 2, maxLength: 5000 })
  @CleanMultiline()
  @IsString()
  @Length(2, 5000)
  body!: string;
}

export class AcceptAnswerDto {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'null clears the accepted answer.' })
  @ValidateIf((o: AcceptAnswerDto) => o.answerId !== null)
  @IsUuidField()
  answerId!: string | null;
}

export class QuestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    type: TargetRefDto,
    nullable: true,
    description: 'type: model | variant | station',
  })
  target!: TargetRefDto | null;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) body!: string | null;
  @ApiProperty() locale!: string;
  @ApiProperty({ type: AuthorDto }) author!: AuthorDto;
  @ApiProperty({ type: VotesDto }) votes!: VotesDto;
  @ApiProperty({ description: 'Visible answers.' }) answerCount!: number;
  @ApiProperty({ type: String, nullable: true }) acceptedAnswerId!: string | null;
  @ApiProperty({ enum: MODERATION_STATUSES }) status!: string;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ type: String, nullable: true }) editedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AnswerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: AuthorDto }) author!: AuthorDto;
  @ApiProperty({ type: VotesDto }) votes!: VotesDto;
  @ApiProperty() isAccepted!: boolean;
  @ApiProperty({ enum: MODERATION_STATUSES }) status!: string;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ type: String, nullable: true }) editedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class QuestionDetailDto extends QuestionDto {
  @ApiProperty({ type: AnswerDto, nullable: true }) acceptedAnswer!: AnswerDto | null;
}

// --- votes & reports -----------------------------------------------------------------------

export class VoteDto {
  @ApiProperty({ enum: VOTE_TARGETS })
  @IsIn(VOTE_TARGETS)
  targetType!: VoteTarget;

  @ApiProperty({ format: 'uuid' })
  @IsUuidField()
  targetId!: string;

  @ApiProperty({ enum: [1, -1, 0], description: '1 helpful, -1 not helpful, 0 removes my vote.' })
  @IsIn([1, -1, 0])
  value!: 1 | -1 | 0;
}

export class VoteResultDto {
  @ApiProperty({ enum: VOTE_TARGETS }) targetType!: string;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ type: VotesDto }) votes!: VotesDto;
}

export class CreateContentReportDto {
  @ApiProperty({ enum: REPORT_TARGETS })
  @IsIn(REPORT_TARGETS)
  targetType!: ReportTarget;

  @ApiProperty({ format: 'uuid' })
  @IsUuidField()
  targetId!: string;

  @ApiProperty({ enum: CONTENT_REPORT_REASONS })
  @IsIn(CONTENT_REPORT_REASONS)
  reason!: (typeof CONTENT_REPORT_REASONS)[number];

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Required when the reason requires details.',
  })
  @IsOptional()
  @CleanMultiline()
  @IsString()
  @Length(3, 1000)
  details?: string;
}

export class ContentReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: REPORT_TARGETS }) targetType!: string;
  @ApiProperty({ format: 'uuid' }) targetId!: string;
  @ApiProperty({ enum: CONTENT_REPORT_REASONS }) reason!: string;
  @ApiProperty() reasonLabel!: string;
  @ApiProperty({ type: String, nullable: true }) details!: string | null;
  @ApiProperty({ enum: ['open', 'in_review', 'resolved', 'rejected'] }) status!: string;
  @ApiProperty() createdAt!: string;
}

export class ReportReasonDto {
  @ApiProperty({ enum: CONTENT_REPORT_REASONS }) code!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() requiresDetails!: boolean;
}

// --- me ---------------------------------------------------------------------------------------

export class MyContentQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: CONTENT_TYPES })
  @IsIn(CONTENT_TYPES)
  type!: ContentType;
}

export class MyContentItemDto {
  @ApiProperty({ enum: CONTENT_TYPES }) type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: TargetRefDto, nullable: true }) target!: TargetRefDto | null;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty() excerpt!: string;
  @ApiProperty({ enum: MODERATION_STATUSES, description: 'pending = waiting for a moderator.' })
  status!: string;
  @ApiProperty({ type: VotesDto }) votes!: VotesDto;
  @ApiProperty() createdAt!: string;
}

export class CommunityStatusDto {
  @ApiProperty() canPost!: boolean;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ description: 'New accounts: stricter limits, no links, posts reviewed first.' })
  isNewAccount!: boolean;
  @ApiProperty({ type: String, nullable: true }) newAccountUntil!: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    properties: {
      scope: { type: 'string' },
      reason: { type: 'string', nullable: true },
      expiresAt: { type: 'string', nullable: true },
    },
  })
  block!: { scope: string; reason: string | null; expiresAt: string | null } | null;
}

export class MutedUserDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() mutedAt!: string;
}

export const USER_VERIFICATION_METHODS = ['document_review', 'dealer_confirmation'] as const;

export class CreateOwnerVerificationDto {
  @ApiProperty({ format: 'uuid', description: 'Trim the user owns.' })
  @IsUuidField()
  variantId!: string;

  @ApiProperty({
    enum: USER_VERIFICATION_METHODS,
    description:
      'document_review: staff check an ownership document (evidenceAssetId, uploaded with purpose owner_evidence); dealer_confirmation: staff confirm with the dealer / importer.',
  })
  @IsIn(USER_VERIFICATION_METHODS)
  method!: (typeof USER_VERIFICATION_METHODS)[number];

  @ApiPropertyOptional({ format: 'uuid', description: "The user's own garage car of this trim." })
  @IsOptional()
  @IsUuidField()
  userVehicleId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Private media asset uploaded by the caller (purpose owner_evidence).',
  })
  @IsOptional()
  @IsUuidField()
  evidenceAssetId?: string;
}

export class OwnerVerificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty({ type: String, nullable: true }) variantName!: string | null;
  @ApiProperty({ type: String, nullable: true }) userVehicleId!: string | null;
  @ApiProperty({ enum: ['document_review', 'dealer_confirmation', 'other'] }) method!: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'revoked', 'expired'] }) status!: string;
  @ApiProperty() hasEvidence!: boolean;
  @ApiProperty({ type: String, nullable: true }) evidenceDeletedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Staff note shown to the user.' })
  decisionNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) expiresAt!: string | null;
  @ApiProperty() createdAt!: string;
}
