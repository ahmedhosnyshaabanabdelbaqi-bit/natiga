<?php

declare(strict_types=1);

namespace Tests;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Support\PosTestFixture;

abstract class TestCase extends BaseTestCase
{
    protected PosTestFixture $shop;

    /** Seed the baseline (permissions, accounts, branch, till) and build a shop. */
    protected function bootShop(): PosTestFixture
    {
        $this->seed(DatabaseSeeder::class);

        return $this->shop = new PosTestFixture;
    }
}
