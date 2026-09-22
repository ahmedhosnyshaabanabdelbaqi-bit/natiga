import { Head } from '@inertiajs/react';
import { PageHeader } from '@/components/shared/page-header';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import { AnnouncementForm } from '@/features/notifications/announcement-form';
import { CampaignStatusBadge } from '@/features/notifications/campaign-status-badge';
import type { AudienceOption, Campaign, ChannelOption, Option } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { edit, index, show } from '@/routes/admin/notifications';

type Props = { audiences: AudienceOption[]; channels: ChannelOption[]; categories: Option[]; campaign: Campaign };

export default function EditAnnouncement({ audiences, channels, categories, campaign }: Props) {
    return (
        <>
            <Head title={t('notifications.admin.edit_campaign')} />
            <div className="space-y-6">
                <PageHeader title={t('notifications.admin.edit_campaign')} description={campaign.title}>
                    <div className="mt-2">
                        <CampaignStatusBadge status={campaign.status} label={campaign.status_label} />
                    </div>
                </PageHeader>
                <AdminNotificationsNav current="campaigns" />
                <AnnouncementForm audiences={audiences} channels={channels} categories={categories} campaign={campaign} onCancelHref={show.url(campaign.id)} />
            </div>
        </>
    );
}

EditAnnouncement.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('notifications.admin.title'), href: index.url() },
        { title: props.campaign.title, href: show.url(props.campaign.id) },
        { title: t('notifications.admin.edit_campaign'), href: edit.url(props.campaign.id) },
    ],
});
