import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/formatting/formatters.dart';
import '../../../core/l10n/l10n.dart';
import '../../../core/links/external_links.dart';
import '../../../core/settings/app_settings.dart';
import '../../../core/settings/settings_controller.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/section_header.dart';
import '../../auth/presentation/auth_controller.dart';

/// `/settings` — language (independent of market), market, theme, text size
/// with live preview, Arabic-Indic digits, cache, about/legal/licences.
/// Everything here works for guests and is stored on the device.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final settings = ref.watch(settingsControllerProvider);
    final controller = ref.read(settingsControllerProvider.notifier);
    final configState = ref.watch(appConfigControllerProvider).value;
    final config = ref.watch(appConfigProvider);
    final language = ref.watch(effectiveLanguageProvider);
    final market = ref.watch(effectiveMarketProvider);
    final version = ref.watch(appVersionProvider);
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final markets = config.enabledMarkets;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        key: const PageStorageKey('settings-list'),
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          // ---------------------------------------------------------------- Language
          SectionHeader(title: l10n.settingsLanguageSection, subtitle: l10n.settingsLanguageHint),
          RadioGroup<String>(
            groupValue: settings.languageCode ?? 'system',
            onChanged: (v) => controller.setLanguage(v == null || v == 'system' ? null : v),
            child: Column(
              children: [
                RadioListTile<String>(value: 'system', title: Text(l10n.settingsLanguageSystem)),
                RadioListTile<String>(value: 'ar', title: Text(l10n.settingsLanguageArabic)),
                RadioListTile<String>(value: 'en', title: Text(l10n.settingsLanguageEnglish)),
              ],
            ),
          ),

          // ---------------------------------------------------------------- Market
          SectionHeader(title: l10n.settingsMarketSection, subtitle: l10n.settingsMarketHint),
          if (markets.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(l10n.settingsMarketsUnavailable))
          else
            RadioGroup<String>(
              groupValue: market.code,
              onChanged: (v) => controller.setMarket(v),
              child: Column(
                children: [
                  for (final m in markets)
                    RadioListTile<String>(
                      value: m.code,
                      title: Text(m.nameFor(language)),
                      subtitle: m.currency.isEmpty
                          ? null
                          : Text(l10n.settingsMarketCurrency(fmt.currencySymbol(m.currency))),
                    ),
                ],
              ),
            ),

          // ---------------------------------------------------------------- Theme
          SectionHeader(title: l10n.settingsThemeSection),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SegmentedButton<ThemeMode>(
              segments: [
                ButtonSegment(
                  value: ThemeMode.light,
                  icon: const Icon(Icons.light_mode_outlined),
                  label: Text(l10n.settingsThemeLight),
                ),
                ButtonSegment(
                  value: ThemeMode.dark,
                  icon: const Icon(Icons.dark_mode_outlined),
                  label: Text(l10n.settingsThemeDark),
                ),
                ButtonSegment(
                  value: ThemeMode.system,
                  icon: const Icon(Icons.brightness_auto_outlined),
                  label: Text(l10n.settingsThemeSystem),
                ),
              ],
              selected: {settings.themeMode},
              onSelectionChanged: (s) => controller.setThemeMode(s.first),
            ),
          ),

          // ---------------------------------------------------------------- Text size
          SectionHeader(title: l10n.settingsTextSizeSection, subtitle: l10n.settingsTextSizeHint),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                IconButton(
                  tooltip: l10n.settingsTextSizeDecrease,
                  onPressed: settings.textScale <= AppSettings.minTextScale
                      ? null
                      : () => controller.setTextScale(settings.textScale - 0.05),
                  icon: const Icon(Icons.text_decrease),
                ),
                Expanded(
                  child: Slider(
                    value: settings.textScale,
                    min: AppSettings.minTextScale,
                    max: AppSettings.maxTextScale,
                    divisions: ((AppSettings.maxTextScale - AppSettings.minTextScale) / 0.05).round(),
                    label: fmt.percent(settings.textScale * 100),
                    semanticFormatterCallback: (v) => fmt.percent(v * 100) ?? '',
                    onChanged: (v) => controller.setTextScale(double.parse(v.toStringAsFixed(2))),
                  ),
                ),
                IconButton(
                  tooltip: l10n.settingsTextSizeIncrease,
                  onPressed: settings.textScale >= AppSettings.maxTextScale
                      ? null
                      : () => controller.setTextScale(settings.textScale + 0.05),
                  icon: const Icon(Icons.text_increase),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.settingsFontPreviewTitle, style: theme.textTheme.labelLarge),
                  const SizedBox(height: 8),
                  Text(l10n.settingsFontPreviewSample, style: theme.textTheme.bodyLarge),
                  const SizedBox(height: 4),
                  Text(
                    l10n.settingsFontPreviewNumbers(fmt.number(1234567.5)!, fmt.date(DateTime.now())!),
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
          SwitchListTile(
            value: settings.arabicIndicDigits,
            onChanged: controller.setArabicIndicDigits,
            title: Text(l10n.settingsDigitsTitle),
            subtitle: Text(l10n.settingsDigitsSubtitle),
          ),

          // ---------------------------------------------------------------- Data
          SectionHeader(title: l10n.settingsDataSection),
          ListTile(
            leading: const Icon(Icons.cleaning_services_outlined),
            title: Text(l10n.settingsClearCache),
            subtitle: Text(l10n.settingsClearCacheSubtitle),
            onTap: () => _clearCache(context, ref),
          ),

          // ---------------------------------------------------------------- About
          SectionHeader(title: l10n.settingsAboutSection),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: Text(version == null ? l10n.settingsVersionUnknown : l10n.settingsVersion(version)),
          ),
          if (configState != null)
            ListTile(
              leading: Icon(switch (configState.source) {
                AppConfigSource.network => Icons.cloud_done_outlined,
                AppConfigSource.cache => Icons.history,
                AppConfigSource.fallback => Icons.cloud_off_outlined,
              }),
              title: Text(switch (configState.source) {
                AppConfigSource.network => l10n.settingsConfigNetwork(fmt.dateTime(configState.savedAt) ?? ''),
                AppConfigSource.cache => l10n.settingsConfigCache(fmt.dateTime(configState.savedAt) ?? ''),
                AppConfigSource.fallback => l10n.settingsConfigFallback,
              }),
              trailing: IconButton(
                tooltip: l10n.settingsConfigRefresh,
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.read(appConfigControllerProvider.notifier).refresh(),
              ),
            ),
          if (config.legal.privacyUrl != null)
            ListTile(
              leading: const Icon(Icons.privacy_tip_outlined),
              title: Text(l10n.settingsPrivacy),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => openExternalUrl(context, config.legal.privacyUrl!),
            ),
          if (config.legal.termsUrl != null)
            ListTile(
              leading: const Icon(Icons.gavel_outlined),
              title: Text(l10n.settingsTerms),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => openExternalUrl(context, config.legal.termsUrl!),
            ),
          ListTile(
            leading: const Icon(Icons.description_outlined),
            title: Text(l10n.settingsLicenses),
            onTap: () => showLicensePage(
              context: context,
              applicationName: config.branding.appName,
              applicationVersion: version,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _clearCache(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(l10n.settingsClearCacheConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.commonConfirm)),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final cache = ref.read(jsonCacheProvider);
    await cache.clear();
    // Keep what the app needs to start offline: the signed-in profile and
    // the last server configuration.
    final user = ref.read(authControllerProvider).user;
    if (user != null) await cache.put(AuthController.userCacheKey, user.toJson());
    final configState = ref.read(appConfigControllerProvider).value;
    if (configState != null && configState.source != AppConfigSource.fallback) {
      await cache.put(AppConfigController.cacheKey, configState.config.toJson());
    }
    messenger.showSnackBar(SnackBar(content: Text(l10n.settingsClearCacheDone)));
  }
}
