<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\Membership;
use App\Modules\Notifications\Jobs\SendAnnouncementJob;
use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\AnnouncementRecipient;
use App\Modules\Notifications\Models\Enums\CampaignStatus;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\Enums\RecipientStatus;
use App\Support\Exceptions\DomainException;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\LazyCollection;
use Throwable;

final class AnnouncementService
{
    public const CHUNK = 500;

    public const NOTIFICATION_KEY = 'system.announcement';

    public function __construct(private readonly AuditService $audit, private readonly NotificationService $notifications, private readonly EmailTemplateRenderer $renderer) {}

    /** @param  array<string, mixed>  $input */
    public function create(array $input, User $actor): AnnouncementCampaign
    {
        $attributes = $this->attributesFrom($input);
        $campaign = AnnouncementCampaign::query()->create($attributes + ['status' => CampaignStatus::Draft, 'created_by' => $actor->id, 'updated_by' => $actor->id]);
        $this->audit->log('notifications.campaign_created', $campaign, new: $this->auditable($campaign), actor: $actor);

        return $campaign;
    }

    /** @param  array<string, mixed>  $input */
    public function update(AnnouncementCampaign $campaign, array $input, User $actor): AnnouncementCampaign
    {
        if (! $campaign->status->isEditable()) {
            throw DomainException::because('notifications.errors.campaign_not_editable');
        }
        $before = $this->auditable($campaign);
        $campaign->fill($this->attributesFrom($input) + ['updated_by' => $actor->id])->save();
        $this->audit->logChanges('notifications.campaign_updated', $campaign, $before, $this->auditable($campaign), actor: $actor);

        return $campaign;
    }

    public function delete(AnnouncementCampaign $campaign, User $actor): void
    {
        if ($campaign->status !== CampaignStatus::Draft) {
            throw DomainException::because('notifications.errors.campaign_not_deletable');
        }
        $this->audit->log('notifications.campaign_deleted', $campaign, old: $this->auditable($campaign), actor: $actor);
        $campaign->delete();
    }

    public function sendNow(AnnouncementCampaign $campaign, User $actor): AnnouncementCampaign
    {
        return DB::transaction(function () use ($campaign, $actor) {
            $campaign = AnnouncementCampaign::query()->whereKey($campaign->id)->lockForUpdate()->firstOrFail();
            if (! in_array($campaign->status, [CampaignStatus::Draft, CampaignStatus::Scheduled, CampaignStatus::Failed], true)) {
                throw DomainException::because('notifications.errors.campaign_not_sendable');
            }
            if ($campaign->status !== CampaignStatus::Failed && $this->estimate($campaign->audience_type, $campaign->audience_params ?? []) === 0) {
                throw DomainException::because('notifications.errors.no_recipients', [], 'audience_type');
            }
            $old = $campaign->status->value;
            $campaign->forceFill(['status' => CampaignStatus::Sending, 'scheduled_at' => null, 'started_at' => now(), 'finished_at' => null, 'last_error' => null, 'updated_by' => $actor->id])->save();
            $this->audit->log($old === CampaignStatus::Failed->value ? 'notifications.campaign_retried' : 'notifications.campaign_sent', $campaign, old: ['status' => $old], new: ['status' => 'sending'], actor: $actor);
            SendAnnouncementJob::dispatch($campaign->id)->afterCommit();

            return $campaign;
        });
    }

    public function schedule(AnnouncementCampaign $campaign, CarbonInterface $at, User $actor): AnnouncementCampaign
    {
        if (! $campaign->status->isEditable()) {
            throw DomainException::because('notifications.errors.campaign_not_editable');
        }
        if ($at->isPast()) {
            throw DomainException::because('notifications.errors.schedule_in_past', [], 'scheduled_at');
        }
        $old = ['status' => $campaign->status->value, 'scheduled_at' => $campaign->scheduled_at?->toIso8601String()];
        $campaign->forceFill(['status' => CampaignStatus::Scheduled, 'scheduled_at' => $at, 'updated_by' => $actor->id])->save();
        $this->audit->log('notifications.campaign_scheduled', $campaign, old: $old, new: ['status' => 'scheduled', 'scheduled_at' => $at->toIso8601String()], actor: $actor);

        return $campaign;
    }

    public function cancel(AnnouncementCampaign $campaign, User $actor, ?string $reason = null): AnnouncementCampaign
    {
        return DB::transaction(function () use ($campaign, $actor, $reason) {
            $campaign = AnnouncementCampaign::query()->whereKey($campaign->id)->lockForUpdate()->firstOrFail();
            if (! $campaign->status->isCancellable()) {
                throw DomainException::because('notifications.errors.campaign_not_cancellable');
            }
            $old = $campaign->status->value;
            $campaign->forceFill(['status' => CampaignStatus::Cancelled, 'updated_by' => $actor->id])->save();
            $this->audit->log('notifications.campaign_cancelled', $campaign, old: ['status' => $old], new: ['status' => 'cancelled'], reason: $reason, actor: $actor);

            return $campaign;
        });
    }

    /** Moves due scheduled campaigns to `sending` (atomically) and dispatches their jobs. Returns how many were dispatched. */
    public function dispatchDue(): int
    {
        $dispatched = 0;
        $ids = AnnouncementCampaign::query()->where('status', CampaignStatus::Scheduled->value)->where('scheduled_at', '<=', now())->orderBy('scheduled_at')->pluck('id');
        foreach ($ids as $id) {
            $claimed = AnnouncementCampaign::query()->whereKey($id)->where('status', CampaignStatus::Scheduled->value)
                ->update(['status' => CampaignStatus::Sending->value, 'started_at' => now(), 'updated_at' => now()]);
            if ($claimed === 1) {
                SendAnnouncementJob::dispatch((int) $id);
                $dispatched++;
            }
        }

        return $dispatched;
    }

    /**
     * Executes a campaign (called by SendAnnouncementJob). Idempotent: recipients are unique per campaign and every
     * notification carries the campaign dedup key, so a re-run only processes what is still pending.
     */
    public function run(int $campaignId): ?AnnouncementCampaign
    {
        $campaign = DB::transaction(function () use ($campaignId): ?AnnouncementCampaign {
            $campaign = AnnouncementCampaign::query()->whereKey($campaignId)->lockForUpdate()->first();
            if ($campaign === null || ! in_array($campaign->status, [CampaignStatus::Sending, CampaignStatus::Scheduled], true)) {
                return null;
            }
            $campaign->forceFill(['status' => CampaignStatus::Sending, 'started_at' => $campaign->started_at ?? now()])->save();

            return $campaign;
        });
        if ($campaign === null) {
            return null;
        }

        try {
            $audience = AnnouncementAudiences::resolve($campaign->audience_type, $campaign->audience_params ?? []);
            $this->eachChunk($audience, fn (Collection $users) => $this->processChunk($campaign, $users));
            $this->refreshCounters($campaign);
            $campaign->forceFill(['status' => CampaignStatus::Sent, 'finished_at' => now(), 'last_error' => null])->save();
        } catch (Throwable $e) {
            $this->refreshCounters($campaign);
            $campaign->forceFill(['status' => CampaignStatus::Failed, 'finished_at' => now(), 'last_error' => mb_substr($e->getMessage(), 0, 2000)])->save();
            $this->audit->log('notifications.campaign_failed', $campaign, new: ['error' => mb_substr($e->getMessage(), 0, 500)], actorType: 'job');
            throw $e;
        }

        return $campaign;
    }

    /** @param  array<string, mixed>  $params */
    public function estimate(string $type, array $params): int
    {
        return AnnouncementAudiences::count($type, $this->normaliseAudienceParams($type, $params));
    }

    /**
     * Validates and normalises audience params (member numbers are resolved server-side here).
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function normaliseAudienceParams(string $type, array $params): array
    {
        if (! AnnouncementAudiences::has($type)) {
            throw DomainException::because('notifications.errors.unknown_audience', [], 'audience_type');
        }
        if ($type === AnnouncementAudiences::SPECIFIC_MEMBERS) {
            $raw = $params['member_numbers'] ?? '';
            $numbers = is_array($raw) ? $raw : preg_split('/[\s,;]+/u', (string) $raw) ?: [];
            $numbers = array_values(array_unique(array_filter(array_map(fn ($n) => strtoupper(trim((string) $n)), $numbers))));
            if ($numbers === []) {
                throw DomainException::because('validation.required', ['attribute' => __('notifications.admin.fields.member_numbers')], 'audience_params.member_numbers');
            }
            $known = Membership::query()->whereIn('member_number', $numbers)->pluck('member_number')->all();
            $unknown = array_values(array_diff($numbers, $known));
            if ($unknown !== []) {
                throw DomainException::because('notifications.errors.unknown_member_numbers', ['numbers' => implode(', ', array_slice($unknown, 0, 20))], 'audience_params.member_numbers');
            }

            return ['member_numbers' => $numbers];
        }

        $normalised = [];
        foreach (AnnouncementAudiences::fieldsFor($type) as $field) {
            $value = $params[$field['name']] ?? null;
            $normalised[$field['name']] = match ($field['type']) {
                'select', 'number' => is_numeric($value) ? (int) $value : $value,
                default => is_scalar($value) ? (string) $value : $value,
            };
        }

        return $normalised;
    }

    /**
     * Preview for the admin form (per locale, with the email rendering using sample member data).
     *
     * @param  array<string, mixed>  $input
     * @return array<string, array{title: string, body: string, email_subject: string, email_html: string}>
     */
    public function preview(array $input): array
    {
        $out = [];
        foreach (ev_locales() as $locale) {
            $data = ['_title' => ['ar' => (string) ($input['title_ar'] ?? ''), 'en' => (string) ($input['title_en'] ?? '')], '_body' => ['ar' => (string) ($input['body_ar'] ?? ''), 'en' => (string) ($input['body_en'] ?? '')]];
            [$title, $body] = $this->notifications->resolveText(self::NOTIFICATION_KEY, $data, $locale);
            $variables = $this->renderer->sampleVariables(self::NOTIFICATION_KEY, $locale);
            $variables['title'] = $title;
            $variables['body'] = $body;
            $variables['url'] = $this->notifications->absoluteUrl(isset($input['url']) && is_string($input['url']) ? $input['url'] : null);
            $email = $this->renderer->render(self::NOTIFICATION_KEY, $locale, $variables);
            $out[$locale] = ['title' => $title, 'body' => $body, 'email_subject' => $email['subject'], 'email_html' => $email['html']];
        }

        return $out;
    }

    /** @param  array<string, mixed>  $filters */
    public function paginate(array $filters, int $perPage = 20): LengthAwarePaginator
    {
        $status = CampaignStatus::tryFrom((string) ($filters['status'] ?? ''));
        $search = trim((string) ($filters['search'] ?? ''));

        return AnnouncementCampaign::query()
            ->when($status, fn (Builder $q) => $q->where('status', $status->value))
            ->when($search !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w->where('title_ar', 'ilike', '%'.$search.'%')->orWhere('title_en', 'ilike', '%'.$search.'%')))
            ->with('creator:id,name')
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($perPage)->withQueryString();
    }

    /** @return array<string, mixed> */
    public function present(AnnouncementCampaign $campaign, bool $withParams = false): array
    {
        $skipped = max(0, $campaign->recipients_count - $campaign->sent_count - $campaign->failed_count);
        $locale = app()->getLocale();
        $row = [
            'id' => $campaign->public_id,
            'title' => $campaign->title($locale),
            'title_ar' => $campaign->title_ar,
            'title_en' => $campaign->title_en,
            'body_ar' => $campaign->body_ar,
            'body_en' => $campaign->body_en,
            'url' => $campaign->url,
            'category' => $campaign->category,
            'category_label' => NotificationCategory::tryFrom($campaign->category)?->label() ?? $campaign->category,
            'audience_type' => $campaign->audience_type,
            'audience_label' => AnnouncementAudiences::label($campaign->audience_type),
            'audience_summary' => $this->audienceSummary($campaign),
            'channels' => $campaign->channels,
            'is_marketing' => $campaign->is_marketing,
            'status' => $campaign->status->value,
            'status_label' => $campaign->status->label(),
            'scheduled_at' => $campaign->scheduled_at?->toIso8601String(),
            'started_at' => $campaign->started_at?->toIso8601String(),
            'finished_at' => $campaign->finished_at?->toIso8601String(),
            'recipients_count' => $campaign->recipients_count,
            'sent_count' => $campaign->sent_count,
            'failed_count' => $campaign->failed_count,
            'skipped_count' => $campaign->status === CampaignStatus::Sent || $campaign->status === CampaignStatus::Failed ? $skipped : 0,
            'last_error' => $campaign->last_error,
            'created_by' => $campaign->relationLoaded('creator') ? $campaign->creator?->name : null,
            'created_at' => $campaign->created_at?->toIso8601String(),
            'updated_at' => $campaign->updated_at?->toIso8601String(),
            'can' => [
                'edit' => $campaign->status->isEditable(),
                'send' => in_array($campaign->status, [CampaignStatus::Draft, CampaignStatus::Scheduled], true),
                'retry' => $campaign->status === CampaignStatus::Failed,
                'schedule' => $campaign->status->isEditable(),
                'cancel' => $campaign->status->isCancellable(),
                'delete' => $campaign->status === CampaignStatus::Draft,
            ],
        ];
        if ($withParams) {
            $row['audience_params'] = $campaign->audience_params ?? [];
        }

        return $row;
    }

    private function audienceSummary(AnnouncementCampaign $campaign): string
    {
        $params = $campaign->audience_params ?? [];
        if ($campaign->audience_type === AnnouncementAudiences::SPECIFIC_MEMBERS) {
            return AnnouncementAudiences::label($campaign->audience_type).' ('.count((array) ($params['member_numbers'] ?? [])).')';
        }
        foreach (AnnouncementAudiences::fieldsFor($campaign->audience_type) as $field) {
            if (($field['type'] ?? null) === 'select' && isset($params[$field['name']]) && isset($field['options']) && $field['options'] instanceof \Closure) {
                try {
                    foreach (($field['options'])() as $option) {
                        if ((string) $option['value'] === (string) $params[$field['name']]) {
                            return AnnouncementAudiences::label($campaign->audience_type).': '.$option['label'];
                        }
                    }
                } catch (Throwable $e) {
                    report($e);
                }
            }
        }

        return AnnouncementAudiences::label($campaign->audience_type);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function attributesFrom(array $input): array
    {
        $channels = array_values(array_unique(array_filter(array_map('strval', (array) ($input['channels'] ?? [])), fn ($c) => NotificationChannel::tryFrom($c) !== null)));
        if (! in_array(NotificationChannel::InApp->value, $channels, true)) {
            array_unshift($channels, NotificationChannel::InApp->value);
        }
        foreach ($channels as $channel) {
            if ($channel !== NotificationChannel::InApp->value && ! Channels::isConfigured($channel)) {
                throw DomainException::because('notifications.errors.channel_not_configured', ['channel' => NotificationChannel::from($channel)->label()], 'channels');
            }
        }
        $type = (string) ($input['audience_type'] ?? '');
        $params = $this->normaliseAudienceParams($type, (array) ($input['audience_params'] ?? []));
        $url = isset($input['url']) && is_string($input['url']) && trim($input['url']) !== '' ? trim($input['url']) : null;
        if ($url !== null && ! preg_match('#^(https://|/)#i', $url)) {
            throw DomainException::because('notifications.errors.invalid_url', [], 'url');
        }

        return [
            'title_ar' => trim((string) $input['title_ar']),
            'title_en' => trim((string) $input['title_en']),
            'body_ar' => trim((string) $input['body_ar']),
            'body_en' => trim((string) $input['body_en']),
            'url' => $url,
            'category' => NotificationCategory::tryFrom((string) ($input['category'] ?? ''))?->value ?? NotificationCategory::System->value,
            'audience_type' => $type,
            'audience_params' => $params,
            'channels' => $channels,
            'is_marketing' => filter_var($input['is_marketing'] ?? false, FILTER_VALIDATE_BOOL),
        ];
    }

    /** @return array<string, mixed> */
    private function auditable(AnnouncementCampaign $campaign): array
    {
        return [
            'title_ar' => $campaign->title_ar, 'title_en' => $campaign->title_en, 'category' => $campaign->category, 'url' => $campaign->url,
            'audience_type' => $campaign->audience_type, 'audience_params' => $campaign->audience_params, 'channels' => $campaign->channels,
            'is_marketing' => $campaign->is_marketing, 'status' => $campaign->status->value, 'scheduled_at' => $campaign->scheduled_at?->toIso8601String(),
        ];
    }

    /** @param  Builder<User>|iterable<int, User>  $audience */
    private function eachChunk(Builder|iterable $audience, \Closure $callback): void
    {
        if ($audience instanceof Builder) {
            $audience->select('users.*')->chunkById(self::CHUNK, fn (Collection $users) => $callback($users), 'users.id', 'id');

            return;
        }
        LazyCollection::make(fn () => yield from $audience)->chunk(self::CHUNK)->each(fn (LazyCollection $chunk) => $callback(new Collection($chunk->filter(fn ($u) => $u instanceof User)->values()->all())));
    }

    /** @param  Collection<int, User>  $users */
    private function processChunk(AnnouncementCampaign $campaign, Collection $users): void
    {
        if ($users->isEmpty()) {
            return;
        }
        $now = now();
        AnnouncementRecipient::query()->insertOrIgnore($users->map(fn (User $u) => [
            'campaign_id' => $campaign->id, 'user_id' => $u->id, 'status' => RecipientStatus::Pending->value, 'created_at' => $now,
        ])->all());
        $pending = AnnouncementRecipient::query()->where('campaign_id', $campaign->id)->whereIn('user_id', $users->pluck('id'))
            ->where('status', RecipientStatus::Pending->value)->pluck('user_id')->flip();
        $users->loadMissing('membership');

        foreach ($users as $user) {
            if (! $pending->has($user->id)) {
                continue;
            }
            try {
                $notification = $this->notifications->send(
                    $user,
                    self::NOTIFICATION_KEY,
                    ['_title' => ['ar' => $campaign->title_ar, 'en' => $campaign->title_en], '_body' => ['ar' => $campaign->body_ar, 'en' => $campaign->body_en], 'campaign' => $campaign->public_id],
                    $campaign->category,
                    ! $campaign->is_marketing,
                    $campaign->dedupKey(),
                    $campaign->url,
                    $campaign->channels,
                );
                AnnouncementRecipient::query()->where('campaign_id', $campaign->id)->where('user_id', $user->id)->update([
                    'status' => $notification ? RecipientStatus::Sent->value : RecipientStatus::Skipped->value,
                    'notification_id' => $notification?->id,
                    'error' => $notification ? null : 'preference_disabled',
                    'sent_at' => $notification ? now() : null,
                ]);
            } catch (Throwable $e) {
                report($e);
                AnnouncementRecipient::query()->where('campaign_id', $campaign->id)->where('user_id', $user->id)->update([
                    'status' => RecipientStatus::Failed->value, 'error' => mb_substr($e->getMessage(), 0, 2000),
                ]);
            }
        }
    }

    private function refreshCounters(AnnouncementCampaign $campaign): void
    {
        $counts = AnnouncementRecipient::query()->where('campaign_id', $campaign->id)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $campaign->forceFill([
            'recipients_count' => (int) $counts->sum(),
            'sent_count' => (int) ($counts[RecipientStatus::Sent->value] ?? 0),
            'failed_count' => (int) ($counts[RecipientStatus::Failed->value] ?? 0),
        ])->save();
    }
}
