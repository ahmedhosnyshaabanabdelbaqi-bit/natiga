<?php

declare(strict_types=1);

namespace App\Modules\Core\Services;

use App\Models\User;
use App\Modules\Cash\Models\Shift;
use App\Modules\Core\Models\Terminal;

/**
 * Per-request POS context. Resolved once by the `pos.context` middleware so
 * services never re-derive (or trust a client-supplied) branch.
 */
class PosContext
{
    private ?User $user = null;

    private ?Terminal $terminal = null;

    private ?int $branchId = null;

    private ?Shift $shift = null;

    private bool $shiftResolved = false;

    public function set(?User $user, ?Terminal $terminal, ?int $branchId): void
    {
        $this->user = $user;
        $this->terminal = $terminal;
        $this->branchId = $branchId;
        $this->shift = null;
        $this->shiftResolved = false;
    }

    public function user(): ?User
    {
        return $this->user;
    }

    public function userId(): ?int
    {
        return $this->user?->id;
    }

    public function terminal(): ?Terminal
    {
        return $this->terminal;
    }

    public function terminalId(): ?int
    {
        return $this->terminal?->id;
    }

    public function branchId(): ?int
    {
        return $this->branchId;
    }

    /** The open shift on this terminal, if any. */
    public function shift(): ?Shift
    {
        if (! $this->shiftResolved) {
            $this->shiftResolved = true;
            $this->shift = $this->terminal
                ? Shift::query()
                    ->where('terminal_id', $this->terminal->id)
                    ->whereIn('status', ['open', 'closing'])
                    ->first()
                : null;
        }

        return $this->shift;
    }

    public function forgetShift(): void
    {
        $this->shift = null;
        $this->shiftResolved = false;
    }
}
