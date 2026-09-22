<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\MemberNote;
use App\Modules\Members\Models\Membership;

final class MemberNotes
{
    public function __construct(private AuditService $audit) {}

    public function add(Membership $membership, User $author, string $body, bool $pinned = false): MemberNote
    {
        $note = MemberNote::create([
            'membership_id' => $membership->id,
            'author_id' => $author->id,
            'body' => trim($body),
            'is_pinned' => $pinned,
            'created_at' => now(),
        ]);
        $this->audit->log('members.note_added', $membership, new: ['note_id' => $note->id, 'pinned' => $pinned], actor: $author);

        return $note;
    }

    public function togglePin(MemberNote $note, User $actor): MemberNote
    {
        $note->forceFill(['is_pinned' => ! $note->is_pinned])->save();
        $this->audit->log('members.note_pinned', $note->membership, old: ['pinned' => ! $note->is_pinned], new: ['note_id' => $note->id, 'pinned' => $note->is_pinned], actor: $actor);

        return $note;
    }
}
