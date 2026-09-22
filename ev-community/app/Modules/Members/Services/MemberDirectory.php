<?php

namespace App\Modules\Members\Services;

use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Membership;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin listing: whitelisted filters and sorts, server-side pagination, status counts and row shaping.
 */
final class MemberDirectory
{
    public const SORTS = Membership::SORTS;

    public const FILTER_KEYS = ['search', 'status', 'governorate_id', 'joined_from', 'joined_to', 'referral_source', 'sort', 'dir', 'per_page'];

    /** @return array<string, mixed> validated filters (unknown keys dropped, invalid values rejected) */
    public function filters(Request $request, array $overrides = []): array
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(MembershipStatus::values())],
            'governorate_id' => ['nullable', 'integer', Rule::exists('governorates', 'id')],
            'joined_from' => ['nullable', 'date'],
            'joined_to' => ['nullable', 'date', 'after_or_equal:joined_from'],
            'referral_source' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(self::SORTS)],
            'dir' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        return array_merge(array_filter($validated, fn ($v) => $v !== null && $v !== ''), $overrides);
    }

    public function query(array $filters): Builder
    {
        $query = Membership::query()->with(['user', 'governorate'])->select('memberships.*');

        $query->search($filters['search'] ?? null)->status($filters['status'] ?? null);
        if (! empty($filters['governorate_id'])) {
            $query->where('memberships.governorate_id', (int) $filters['governorate_id']);
        }
        if (! empty($filters['joined_from'])) {
            $query->where('memberships.joined_at', '>=', \Illuminate\Support\Carbon::parse($filters['joined_from'])->startOfDay());
        }
        if (! empty($filters['joined_to'])) {
            $query->where('memberships.joined_at', '<=', \Illuminate\Support\Carbon::parse($filters['joined_to'])->endOfDay());
        }
        if (! empty($filters['referral_source'])) {
            $query->where('memberships.referral_source', $filters['referral_source']);
        }

        $sort = in_array($filters['sort'] ?? null, self::SORTS, true) ? $filters['sort'] : 'joined_at';
        $dir = ($filters['dir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        match ($sort) {
            'name' => $query->leftJoin('users', 'users.id', '=', 'memberships.user_id')->orderBy('users.name', $dir),
            'member_number' => $query->orderBy('memberships.member_number', $dir),
            'status' => $query->orderBy('memberships.status', $dir)->orderByDesc('memberships.joined_at'),
            default => $query->orderBy('memberships.joined_at', $dir),
        };
        $query->orderBy('memberships.id', $dir);

        return $query;
    }

    public function paginate(array $filters): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 25);

        return $this->query($filters)->paginate($perPage)->withQueryString();
    }

    /** @return array<string, int> status => count (+ total) */
    public function countsByStatus(): array
    {
        $counts = Membership::query()->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $out = ['total' => 0];
        foreach (MembershipStatus::cases() as $status) {
            $out[$status->value] = (int) ($counts[$status->value] ?? 0);
            $out['total'] += $out[$status->value];
        }

        return $out;
    }

    /** @return string[] distinct referral sources for the filter select */
    public function referralSources(): array
    {
        return Membership::query()->whereNotNull('referral_source')->where('referral_source', '!=', '')
            ->distinct()->orderBy('referral_source')->limit(50)->pluck('referral_source')->all();
    }

    /** @return array<string, mixed> */
    public function row(Membership $membership): array
    {
        return [
            'id' => $membership->public_id,
            'member_number' => $membership->member_number,
            'name' => $membership->user->name,
            'email' => $membership->user->email,
            'mobile' => $membership->user->mobile,
            'status' => $membership->status->value,
            'governorate' => $membership->governorate?->name(),
            'joined_at' => $membership->joined_at?->toIso8601String(),
            'referral_source' => $membership->referral_source,
            'user_status' => $membership->user->status,
        ];
    }
}
