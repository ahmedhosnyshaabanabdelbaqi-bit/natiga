<?php

namespace App\Modules\Members\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Members\Http\Requests\Admin\StoreNoteRequest;
use App\Modules\Members\Models\MemberNote;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Services\MemberNotes;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class MemberNoteController extends Controller
{
    public function store(StoreNoteRequest $request, Membership $membership, MemberNotes $notes): RedirectResponse
    {
        $notes->add($membership, $request->user(), $request->validated('body'), (bool) $request->validated('is_pinned', false));

        return back()->with('success', __('members.flash.note_added'));
    }

    public function pin(Request $request, Membership $membership, MemberNote $note, MemberNotes $notes): RedirectResponse
    {
        Gate::authorize('addNote', $membership);
        abort_unless($note->membership_id === $membership->id, 404);
        $notes->togglePin($note, $request->user());

        return back()->with('success', __('members.flash.note_pinned'));
    }
}
