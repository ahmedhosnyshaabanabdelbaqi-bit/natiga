/**
 * Public API of the i18n module:
 *
 *   import { I18nService, serverMessage } from '../i18n';
 *   throw this.i18n.error('MARKET_IN_USE', 409, { code });
 *   const { title, body } = this.i18n.notification('price_changed', user.locale, params);
 */
export { I18nService, type LocalizedNotification } from './i18n.service';
export {
  CATALOGS,
  interpolate,
  placeholdersOf,
  resolveErrorMessage,
  SERVER_NAMESPACES,
  serverMessage,
  serverMessageText,
  type MessageParams,
} from './server-messages';
