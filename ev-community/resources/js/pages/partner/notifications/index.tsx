import { NotificationCenter } from '@/features/notifications/notification-center';
import type { NotificationCenterProps } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { index, read, readAll, unreadCount } from '@/routes/partner/notifications';

export default function PartnerNotifications(props: NotificationCenterProps) {
    return (
        <NotificationCenter
            {...props}
            title={t('notifications.center.partner_title')}
            description={t('notifications.center.partner_description')}
            endpoints={{ index: index.url(), readAll: readAll.url(), read: (id) => read.url(id), unreadCount: unreadCount.url() }}
        />
    );
}

PartnerNotifications.layout = () => ({ breadcrumbs: [{ title: t('notifications.center.partner_title'), href: index.url() }] });
