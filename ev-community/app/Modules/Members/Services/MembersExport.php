<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\Membership;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams the filtered member list as UTF-8 CSV (BOM for Excel) with locale-aware headers.
 * Every export is audited (members.exported) with the filters used and the row count.
 */
final class MembersExport
{
    private const COLUMNS = ['member_number', 'name', 'email', 'mobile', 'governorate', 'status', 'joined_at', 'approved_at', 'expires_at', 'referral_code', 'referred_by', 'referral_source', 'locale'];

    public function __construct(private MemberDirectory $directory, private AuditService $audit) {}

    public function stream(array $filters, User $actor): StreamedResponse
    {
        $query = $this->directory->query($filters)->with('referrer');
        $count = (clone $query)->count();
        $this->audit->log('members.exported', null, new: ['filters' => array_intersect_key($filters, array_flip(MemberDirectory::FILTER_KEYS)), 'rows' => $count], actor: $actor, entityLabel: 'members.csv');

        $filename = 'members-'.now()->format('Ymd-Hi').'.csv';

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, array_map(fn (string $c) => __('members.export.columns.'.$c), self::COLUMNS));
            $query->reorder('memberships.id')->chunkById(500, function ($rows) use ($out) {
                /** @var Membership $membership */
                foreach ($rows as $membership) {
                    fputcsv($out, [
                        $membership->member_number,
                        $membership->user->name,
                        $membership->user->email,
                        $membership->user->mobile,
                        $membership->governorate?->name(),
                        $membership->status->label(),
                        $membership->joined_at?->timezone(config('ev.timezone'))->format('Y-m-d H:i'),
                        $membership->approved_at?->timezone(config('ev.timezone'))->format('Y-m-d H:i'),
                        $membership->expires_at?->timezone(config('ev.timezone'))->format('Y-m-d'),
                        $membership->referral_code,
                        $membership->referrer?->member_number,
                        $membership->referral_source,
                        $membership->user->preferred_locale,
                    ]);
                }
            }, 'memberships.id', 'id');
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8', 'X-Content-Type-Options' => 'nosniff']);
    }
}
