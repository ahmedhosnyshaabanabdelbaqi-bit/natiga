import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alert, Badge, LoadingState } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

export default function Settings() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [health, setHealth] = useState<Record<string, string> | null>(null);
  const [dictionary, setDictionary] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.get('/health').then(({ data }) => setHealth(data)).catch(() => undefined),
      api.get('/dashboard/dictionary').then(({ data }) => setDictionary(data.data)).catch(() => undefined),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('settings.title')}</h1>
          <div className="desc">{t('settings.desc')}</div>
        </div>
      </div>

      <div className="grid cols-2 mb-4">
        <div className="card">
          <div className="card-head"><h2>{t('settings.system')}</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.systemName')}</span><span className="bold">{health?.system ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.company')}</span><span className="bold">{user?.company_name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.currency')}</span><span>{t('settings.currencyValue')}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.timezone')}</span><span className="num">Africa/Cairo</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.costMethod')}</span><span>{t('settings.costMethodValue')}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.serverStatus')}</span>
              <Badge tone={health?.status === 'ok' ? 'success' : 'danger'}>
                {health?.status === 'ok' ? t('settings.connected') : t('settings.unavailable')}
              </Badge></div>
            <div className="divider" />
            <div className="row">
              <span className="muted" style={{ width: 140 }}>{t('common.language')}</span>
              <div className="row tight">
                <button
                  className={`btn btn-sm ${lang === 'ar' ? 'btn-primary' : ''}`}
                  onClick={() => setLang('ar')}
                >العربية</button>
                <button
                  className={`btn btn-sm ${lang === 'en' ? 'btn-primary' : ''}`}
                  onClick={() => setLang('en')}
                >English</button>
              </div>
            </div>
            <div className="tiny faint">{t('settings.languageDesc')}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('settings.account')}</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('common.name')}</span><span className="bold">{user?.name}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('login.username')}</span><span className="num">{user?.username}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.roles')}</span>
              <span className="row tight">{user?.roles.map((r) => <Badge key={r.id} tone="info">{r.name_ar}</Badge>)}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.viewCost')}</span>
              {user?.can_see_cost ? <Badge tone="success">{t('settings.allowed')}</Badge> : <Badge>{t('settings.notAllowed')}</Badge>}</div>
            <div className="row"><span className="muted" style={{ width: 140 }}>{t('settings.permissionCount')}</span>
              <span className="num">{user?.permissions.length ?? 0}</span></div>
          </div>
        </div>
      </div>

      <Alert tone="warn">
        <strong>{t('settings.beforeLive')}</strong> {t('settings.beforeLiveBody')}
      </Alert>

      {dictionary && (
        <div className="card">
          <div className="card-head">
            <h2>{t('settings.kpiDictionary')}</h2>
            <span className="small muted">{t('settings.kpiDictionaryDesc')}</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{t('settings.kpi')}</th><th>{t('settings.formula')}</th><th>{t('settings.note')}</th></tr></thead>
              <tbody>
                {Object.entries(dictionary).map(([key, def]: [string, any]) => (
                  <tr key={key}>
                    <td className="bold">{def.label}</td>
                    <td className="small">{def.formula}</td>
                    <td className="small muted">{def.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
