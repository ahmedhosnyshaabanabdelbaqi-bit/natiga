import 'package:flutter/material.dart';

import '../../core/l10n/l10n.dart';

/// Rounded search input (Material 3 `SearchBar`) with a clear button.
///
/// ```dart
/// AppSearchField(hintText: l10n.searchHint, onSubmitted: (q) => context.push(AppRoutes.search(query: q)))
/// ```
class AppSearchField extends StatefulWidget {
  const AppSearchField({
    super.key,
    this.controller,
    this.hintText,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.autofocus = false,
    this.readOnly = false,
    this.trailing = const [],
  });

  final TextEditingController? controller;
  final String? hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  /// With [readOnly], makes the field a button that opens the search screen.
  final VoidCallback? onTap;
  final bool autofocus;
  final bool readOnly;
  final List<Widget> trailing;

  @override
  State<AppSearchField> createState() => _AppSearchFieldState();
}

class _AppSearchFieldState extends State<AppSearchField> {
  late final TextEditingController _controller = widget.controller ?? TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onText);
  }

  void _onText() => setState(() {});

  @override
  void dispose() {
    _controller.removeListener(_onText);
    if (widget.controller == null) _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasText = _controller.text.isNotEmpty;
    return SearchBar(
      controller: _controller,
      focusNode: _focus,
      autoFocus: widget.autofocus,
      hintText: widget.hintText ?? l10n.commonSearchHint,
      leading: const Icon(Icons.search),
      textInputAction: TextInputAction.search,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      onTap: widget.onTap,
      keyboardType: widget.readOnly ? TextInputType.none : TextInputType.text,
      padding: const WidgetStatePropertyAll(EdgeInsetsDirectional.only(start: 16, end: 4)),
      trailing: [
        if (hasText && !widget.readOnly)
          IconButton(
            tooltip: l10n.commonClearSearch,
            icon: const Icon(Icons.close),
            onPressed: () {
              _controller.clear();
              widget.onChanged?.call('');
              _focus.requestFocus();
            },
          ),
        ...widget.trailing,
      ],
    );
  }
}
