<?php

namespace Tests\Feature\Notifications;

use App\Modules\Notifications\Models\Notification;
use App\Modules\System\Services\Settings;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PurgeNotificationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_purges_only_read_notifications_older_than_the_retention(): void
    {
        $user = $this->makeMember();
        $oldRead = Notification::factory()->read()->create(['user_id' => $user->id, 'created_at' => now()->subDays(200)]);
        $oldUnread = Notification::factory()->create(['user_id' => $user->id, 'created_at' => now()->subDays(200)]);
        $recentRead = Notification::factory()->read()->create(['user_id' => $user->id, 'created_at' => now()->subDays(10)]);

        $this->artisan('notifications:purge')->assertSuccessful();

        $this->assertModelMissing($oldRead);
        $this->assertModelExists($oldUnread);
        $this->assertModelExists($recentRead);
    }

    public function test_retention_comes_from_settings_with_a_floor_of_seven_days(): void
    {
        $user = $this->makeMember();
        Settings::set('notifications.retention_days', 7);
        $eightDays = Notification::factory()->read()->create(['user_id' => $user->id, 'created_at' => now()->subDays(8)]);
        $threeDays = Notification::factory()->read()->create(['user_id' => $user->id, 'created_at' => now()->subDays(3)]);

        $this->artisan('notifications:purge', ['--days' => 1])->assertSuccessful();

        $this->assertModelMissing($eightDays);
        $this->assertModelExists($threeDays);
    }

    public function test_commands_are_scheduled(): void
    {
        $events = collect(app(Schedule::class)->events())->map(fn ($event) => [$event->command, $event->expression]);

        $this->assertTrue($events->contains(fn ($e) => str_contains((string) $e[0], 'notifications:dispatch-scheduled') && $e[1] === '* * * * *'));
        $this->assertTrue($events->contains(fn ($e) => str_contains((string) $e[0], 'notifications:purge') && $e[1] === '30 3 * * 1'));
    }
}
