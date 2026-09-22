import { NotificationCenter } from '@/features/notifications/notification-center';
import type { NotificationCenterProps } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { inbox } from '@/routes/admin/notifications';
import { read, readAll, unreadCount } from '@/routes/admin/notifications/inbox';

export default function AdminInbox(props: NotificationCenterProps) {
    return (
        <NotificationCenter
            {...props}
            title={t('notifications.center.admin_title')}
            description={t('notifications.center.admin_description')}
            endpoints={{
                index: inbox.url(),
                readAll: readAll.url(),
                read: (id) => read.url(id),
                unreadCount: unreadCount.url(),
            }}
        />
    );
}

AdminInbox.layout = () => ({
    breadcrumbs: [
        { title: t('notifications.center.admin_title'), href: inbox.url() },
    ],
});
