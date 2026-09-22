import { NotificationCenter } from '@/features/notifications/notification-center';
import type { NotificationCenterProps } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import {
    index,
    read,
    readAll,
    unreadCount,
} from '@/routes/member/notifications';

export default function MemberNotifications(props: NotificationCenterProps) {
    return (
        <NotificationCenter
            {...props}
            title={t('notifications.center.title')}
            description={t('notifications.center.description')}
            endpoints={{
                index: index.url(),
                readAll: readAll.url(),
                read: (id) => read.url(id),
                unreadCount: unreadCount.url(),
            }}
        />
    );
}

MemberNotifications.layout = () => ({
    breadcrumbs: [
        { title: t('notifications.center.title'), href: index.url() },
    ],
});
