<?php

namespace App\Modules\Members\Events;

use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/** Personal data of the member has been anonymised (other modules may purge their own PII copies). */
final class MemberAnonymized
{
    use Dispatchable, SerializesModels;

    public function __construct(public readonly Membership $membership, public readonly int $deletionRequestId) {}
}
