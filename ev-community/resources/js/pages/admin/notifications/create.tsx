import { Head } from '@inertiajs/react';
import { PageHeader } from '@/components/shared/page-header';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import { AnnouncementForm } from '@/features/notifications/announcement-form';
import type { AudienceOption, ChannelOption, Option } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { create, index } from '@/routes/admin/notifications';

type Props = { audiences: AudienceOption[]; channels: ChannelOption[]; categories: Option[] };

export default function CreateAnnouncement({ audiences, channels, categories }: Props) {
    return (
        <>
            <Head title={t('notifications.admin.new_campaign')} />
            <div className="space-y-6">
                <PageHeader title={t('notifications.admin.new_campaign')} description={t('notifications.admin.description')} />
                <AdminNotificationsNav current="campaigns" />
                <AnnouncementForm audiences={audiences} channels={channels} categories={categories} onCancelHref={index.url()} />
            </div>
        </>
    );
}

CreateAnnouncement.layout = () => ({
    breadcrumbs: [
        { title: t('notifications.admin.title'), href: index.url() },
        { title: t('notifications.admin.new_campaign'), href: create.url() },
    ],
});
