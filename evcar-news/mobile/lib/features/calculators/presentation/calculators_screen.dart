import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/common/personal_widgets.dart';

/// Title, description and icon of one calculator.
typedef CalculatorInfo = ({String title, String description, IconData icon});

CalculatorInfo? calculatorInfo(AppLocalizations l10n, String kind) => switch (kind) {
  CalculatorKinds.homeCharging => (
    title: l10n.calculatorsHomeTitle,
    description: l10n.calculatorsHomeDescription,
    icon: Icons.home_outlined,
  ),
  CalculatorKinds.publicCharging => (
    title: l10n.calculatorsPublicTitle,
    description: l10n.calculatorsPublicDescription,
    icon: Icons.ev_station_outlined,
  ),
  CalculatorKinds.chargingTime => (
    title: l10n.calculatorsTimeTitle,
    description: l10n.calculatorsTimeDescription,
    icon: Icons.timer_outlined,
  ),
  CalculatorKinds.costPer100Km => (
    title: l10n.calculatorsPer100Title,
    description: l10n.calculatorsPer100Description,
    icon: Icons.speed,
  ),
  CalculatorKinds.monthlyCost => (
    title: l10n.calculatorsMonthlyTitle,
    description: l10n.calculatorsMonthlyDescription,
    icon: Icons.calendar_month_outlined,
  ),
  CalculatorKinds.vsPetrol => (
    title: l10n.calculatorsVsFuelTitle,
    description: l10n.calculatorsVsFuelDescription,
    icon: Icons.local_gas_station_outlined,
  ),
  CalculatorKinds.totalCostOfOwnership => (
    title: l10n.calculatorsTcoTitle,
    description: l10n.calculatorsTcoDescription,
    icon: Icons.account_balance_wallet_outlined,
  ),
  _ => null,
};

/// Calculators hub (`/calculators`), open to guests.
class CalculatorsScreen extends StatelessWidget {
  const CalculatorsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppScaffold.slivers(
      title: l10n.calculatorsTitle,
      largeTitle: true,
      slivers: [
        SliverResponsivePadding(
          maxWidth: kMaxReadableWidth,
          sliver: SliverPadding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.xxl),
            sliver: SliverList.list(
              children: [
                InlineNotice(message: l10n.calculatorsIntro, icon: Icons.verified_user_outlined),
                const SizedBox(height: AppSpacing.lg),
                AdaptiveGrid(
                  minItemWidth: 260,
                  children: [
                    for (final kind in CalculatorKinds.all)
                      if (calculatorInfo(l10n, kind) case final info?)
                        AppCard(
                          onTap: () => context.push(AppRoutes.calculator(kind)),
                          semanticLabel: '${info.title}. ${info.description}',
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(AppSpacing.sm),
                                decoration: BoxDecoration(
                                  gradient: context.palette.brandGradient,
                                  borderRadius: BorderRadius.circular(AppRadii.md),
                                ),
                                child: Icon(info.icon, color: Colors.white),
                              ),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(info.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                    const SizedBox(height: AppSpacing.xxs),
                                    Text(
                                      info.description,
                                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                                    ),
                                  ],
                                ),
                              ),
                              const ForwardChevron(),
                            ],
                          ),
                        ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
