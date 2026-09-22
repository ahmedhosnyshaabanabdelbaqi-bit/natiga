import { router, useForm } from '@inertiajs/react';
import { Pin, PinOff, StickyNote } from 'lucide-react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pin, store } from '@/routes/admin/members/notes';
import { firstError } from './member-status-actions';
import type { MemberNote } from './types';

/** Internal staff notes (never visible to the member). Adding/pinning requires members.notes. */
export function MemberNotes({ membershipId, notes }: { membershipId: string; notes: MemberNote[] }) {
    const can = useCan();
    const canWrite = can('members.notes');
    const form = useForm({ body: '', is_pinned: false });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(store(membershipId).url, {
            preserveScroll: true,
            onSuccess: () => form.reset(),
        });
    };

    const togglePin = (note: MemberNote) => {
        router.patch(pin({ membership: membershipId, note: note.id }).url, {}, { preserveScroll: true, onError: (errors) => toast.error(firstError(errors)) });
    };

    return (
        <div className="grid gap-4">
            {canWrite ? (
                <SectionCard title={t('members.admin.notes.add')}>
                    <form onSubmit={submit} className="grid gap-3" noValidate>
                        <FormField label={t('members.admin.notes.title')} hideLabel error={form.errors.body} required>
                            <Textarea value={form.data.body} onChange={(event) => form.setData('body', event.target.value)} rows={3} maxLength={2000} placeholder={t('members.admin.notes.placeholder')} />
                        </FormField>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Checkbox id="note-pinned" checked={form.data.is_pinned} onCheckedChange={(checked) => form.setData('is_pinned', checked === true)} />
                                <Label htmlFor="note-pinned">{t('members.admin.notes.pin_on_create')}</Label>
                            </div>
                            <Button type="submit" size="sm" disabled={form.processing || form.data.body.trim().length < 2}>
                                {form.processing ? <Spinner /> : null}
                                {t('members.admin.notes.add')}
                            </Button>
                        </div>
                    </form>
                </SectionCard>
            ) : null}
            <SectionCard title={t('members.admin.notes.title')} flush>
                {notes.length === 0 ? (
                    <div className="p-4">
                        <EmptyState icon={StickyNote} title={t('members.admin.notes.empty')} />
                    </div>
                ) : (
                    <ul className="divide-y">
                        {notes.map((note) => (
                            <li key={note.id} className={cn('flex gap-3 px-4 py-3 md:px-6', note.is_pinned && 'bg-warning-soft/30')}>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm break-words whitespace-pre-line">{note.body}</p>
                                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        {note.is_pinned ? <Badge variant="secondary">{t('members.admin.notes.pinned')}</Badge> : null}
                                        <span>{note.author ?? t('members.admin.membership.system')}</span>
                                        <span aria-hidden="true">·</span>
                                        <DateTime value={note.created_at} />
                                    </p>
                                </div>
                                {canWrite ? (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => togglePin(note)} aria-label={note.is_pinned ? t('members.admin.notes.unpin') : t('members.admin.notes.pin')} title={note.is_pinned ? t('members.admin.notes.unpin') : t('members.admin.notes.pin')}>
                                        {note.is_pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>
        </div>
    );
}
