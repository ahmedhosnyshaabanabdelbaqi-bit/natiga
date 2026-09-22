<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Support\Exceptions\DomainException;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pluggable audience registry for announcement campaigns. Other modules register in their ServiceProvider:
 *
 *   AnnouncementAudiences::register('group_buy', 'group_buying.audiences.participants',
 *       fn (array $params) => User::query()->whereHas('groupBuyOrders', fn ($q) => $q->where('group_buy_id', $params['group_buy_id'])),
 *       module: 'group_buying',
 *       fields: [['name' => 'group_buy_id', 'type' => 'select', 'label' => 'group_buying.labels.group_buy', 'rules' => 'required|integer',
 *                 'options' => fn () => GroupBuy::query()->open()->get()->map(fn ($g) => ['value' => $g->id, 'label' => $g->title()])->all()]]);
 *
 * A resolver returns an Eloquent `Builder<User>` (preferred: counted and chunked server-side) or an iterable of User.
 * Recipients are only ever counted for the UI; they are never listed to non-admins.
 */
final class AnnouncementAudiences
{
    public const ALL_MEMBERS = 'all_members';

    public const VEHICLE_MAKE = 'vehicle_make';

    public const VEHICLE_MODEL = 'vehicle_model';

    public const SPECIFIC_MEMBERS = 'specific_members';

    /** @var array<string, array{label: string, resolver: Closure, module: ?string, fields: array<int, array<string, mixed>>}> */
    private static array $audiences = [];

    /**
     * @param  Closure(array<string, mixed>): (Builder<User>|iterable<int, User>)  $resolver
     * @param  array<int, array{name: string, type: string, label: string, rules?: string|array<int, mixed>, options?: Closure, hint?: string}>  $fields  type: select|number|text|textarea
     */
    public static function register(string $key, string $labelKey, Closure $resolver, ?string $module = null, array $fields = []): void
    {
        self::$audiences[$key] = ['label' => $labelKey, 'resolver' => $resolver, 'module' => $module, 'fields' => $fields];
    }

    public static function has(string $key): bool
    {
        return isset(self::$audiences[$key]);
    }

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::$audiences);
    }

    /**
     * Serialisable description for the admin form (labels translated, select options resolved).
     *
     * @return array<int, array{key: string, label: string, module: ?string, fields: array<int, array{name: string, type: string, label: string, hint: ?string, options: array<int, array{value: int|string, label: string}>|null}>}>
     */
    public static function options(): array
    {
        $out = [];
        foreach (self::$audiences as $key => $audience) {
            $fields = [];
            foreach ($audience['fields'] as $field) {
                $options = null;
                if (isset($field['options']) && $field['options'] instanceof Closure) {
                    try {
                        $options = array_values(($field['options'])());
                    } catch (\Throwable $e) {
                        report($e);
                        $options = [];
                    }
                }
                $fields[] = [
                    'name' => $field['name'],
                    'type' => $field['type'],
                    'label' => __($field['label']),
                    'hint' => isset($field['hint']) ? __($field['hint']) : null,
                    'options' => $options,
                ];
            }
            $out[] = ['key' => $key, 'label' => __($audience['label']), 'module' => $audience['module'], 'fields' => $fields];
        }

        return $out;
    }

    /** @return array<int, array<string, mixed>> */
    public static function fieldsFor(string $key): array
    {
        return self::$audiences[$key]['fields'] ?? [];
    }

    /**
     * Validation rules for `audience_params.*` of an audience (from the declared fields).
     *
     * @return array<string, mixed>
     */
    public static function rulesFor(string $key): array
    {
        $rules = [];
        foreach (self::fieldsFor($key) as $field) {
            $rules['audience_params.'.$field['name']] = $field['rules'] ?? 'nullable';
        }

        return $rules;
    }

    /** @return array<string, string> attribute names for validation messages */
    public static function attributesFor(string $key): array
    {
        $attributes = [];
        foreach (self::fieldsFor($key) as $field) {
            $attributes['audience_params.'.$field['name']] = __($field['label']);
        }

        return $attributes;
    }

    public static function label(string $key): string
    {
        return isset(self::$audiences[$key]) ? __(self::$audiences[$key]['label']) : $key;
    }

    /**
     * @param  array<string, mixed>  $params
     * @return Builder<User>|iterable<int, User>
     */
    public static function resolve(string $key, array $params): Builder|iterable
    {
        if (! isset(self::$audiences[$key])) {
            throw DomainException::because('notifications.errors.unknown_audience', [], 'audience_type');
        }

        return (self::$audiences[$key]['resolver'])($params);
    }

    /** @param  array<string, mixed>  $params */
    public static function count(string $key, array $params): int
    {
        $audience = self::resolve($key, $params);
        if ($audience instanceof Builder) {
            return (clone $audience)->reorder()->count();
        }

        return is_countable($audience) ? count($audience) : iterator_count($audience);
    }

    /** Base query shared by the built-in audiences: active user + active membership. */
    public static function activeMembersQuery(): Builder
    {
        return User::query()
            ->where('users.status', User::STATUS_ACTIVE)
            ->whereHas('membership', fn (Builder $q) => $q->where('status', MembershipStatus::Active->value));
    }

    /** Built-in audiences (idempotent; called from the module ServiceProvider). */
    public static function registerDefaults(): void
    {
        self::register(self::ALL_MEMBERS, 'notifications.audiences.all_members', fn (array $params) => self::activeMembersQuery(), 'notifications');

        self::register(self::VEHICLE_MAKE, 'notifications.audiences.vehicle_make', function (array $params) {
            $makeId = (int) ($params['make_id'] ?? 0);
            if ($makeId <= 0 || ! self::tableExists('member_vehicles')) {
                return self::activeMembersQuery()->whereRaw('1 = 0');
            }

            return self::activeMembersQuery()->whereExists(fn ($q) => $q->select(DB::raw(1))->from('member_vehicles')
                ->whereColumn('member_vehicles.user_id', 'users.id')
                ->where('member_vehicles.vehicle_make_id', $makeId)
                ->where('member_vehicles.status', 'active'));
        }, 'notifications', [[
            'name' => 'make_id', 'type' => 'select', 'label' => 'notifications.admin.fields.vehicle_make', 'rules' => ['required', 'integer', 'min:1', 'exists:vehicle_makes,id'],
            'options' => fn () => self::tableExists('vehicle_makes')
                ? DB::table('vehicle_makes')->where('is_active', true)->orderBy('sort_order')->orderBy('name_en')->get(['id', 'name_ar', 'name_en'])
                    ->map(fn ($m) => ['value' => (int) $m->id, 'label' => app()->getLocale() === 'ar' ? $m->name_ar : $m->name_en])->all()
                : [],
        ]]);

        self::register(self::VEHICLE_MODEL, 'notifications.audiences.vehicle_model', function (array $params) {
            $modelId = (int) ($params['model_id'] ?? 0);
            if ($modelId <= 0 || ! self::tableExists('member_vehicles')) {
                return self::activeMembersQuery()->whereRaw('1 = 0');
            }

            return self::activeMembersQuery()->whereExists(fn ($q) => $q->select(DB::raw(1))->from('member_vehicles')
                ->whereColumn('member_vehicles.user_id', 'users.id')
                ->where('member_vehicles.vehicle_model_id', $modelId)
                ->where('member_vehicles.status', 'active'));
        }, 'notifications', [[
            'name' => 'model_id', 'type' => 'select', 'label' => 'notifications.admin.fields.vehicle_model', 'rules' => ['required', 'integer', 'min:1', 'exists:vehicle_models,id'],
            'options' => fn () => self::tableExists('vehicle_models')
                ? DB::table('vehicle_models')->join('vehicle_makes', 'vehicle_makes.id', '=', 'vehicle_models.vehicle_make_id')
                    ->where('vehicle_models.is_active', true)->orderBy('vehicle_makes.name_en')->orderBy('vehicle_models.name_en')
                    ->get(['vehicle_models.id', 'vehicle_models.name_ar', 'vehicle_models.name_en', 'vehicle_makes.name_ar as make_ar', 'vehicle_makes.name_en as make_en'])
                    ->map(fn ($m) => ['value' => (int) $m->id, 'label' => app()->getLocale() === 'ar' ? $m->make_ar.' — '.$m->name_ar : $m->make_en.' — '.$m->name_en])->all()
                : [],
        ]]);

        self::register(self::SPECIFIC_MEMBERS, 'notifications.audiences.specific_members', function (array $params) {
            $numbers = array_values(array_filter(array_map('strval', (array) ($params['member_numbers'] ?? []))));
            if ($numbers === []) {
                return User::query()->whereRaw('1 = 0');
            }

            return self::activeMembersQuery()
                ->whereHas('membership', fn (Builder $q) => $q->whereIn('member_number', $numbers));
        }, 'notifications', [[
            'name' => 'member_numbers', 'type' => 'textarea', 'label' => 'notifications.admin.fields.member_numbers', 'hint' => 'notifications.admin.fields.member_numbers_hint', 'rules' => ['required', 'string', 'max:20000'],
        ]]);
    }

    public static function reset(): void
    {
        self::$audiences = [];
    }

    /** @var array<string, bool> */
    private static array $tables = [];

    private static function tableExists(string $table): bool
    {
        return self::$tables[$table] ??= Schema::hasTable($table);
    }
}
