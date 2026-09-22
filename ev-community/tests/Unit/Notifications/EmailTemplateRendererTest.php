<?php

namespace Tests\Unit\Notifications;

use App\Modules\Notifications\Models\EmailTemplate;
use App\Modules\Notifications\Services\EmailTemplateRenderer;
use Tests\TestCase;

class EmailTemplateRendererTest extends TestCase
{
    private EmailTemplateRenderer $renderer;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://ev.example']);
        $this->renderer = new EmailTemplateRenderer;
    }

    public function test_variable_values_are_escaped_and_never_interpreted(): void
    {
        $html = $this->renderer->renderHtml('Hello {{name}}', ['name' => '<script>alert(1)</script> **x** [a](https://evil)']);

        $this->assertSame('<p>Hello &lt;script&gt;alert(1)&lt;/script&gt; **x** [a](https://evil)</p>', $html);
    }

    public function test_template_markup_is_escaped_and_the_markdown_subset_is_rendered(): void
    {
        $html = $this->renderer->renderHtml("Line <b>1</b>\nLine **2**\n\n[Open](https://ev.example/account?a=1&b=2) & more", []);

        $this->assertSame("<p>Line &lt;b&gt;1&lt;/b&gt;<br>\nLine <strong>2</strong></p>".'<p><a href="https://ev.example/account?a=1&amp;b=2">Open</a> &amp; more</p>', $html);
    }

    public function test_unsafe_links_are_not_rendered_as_anchors(): void
    {
        foreach (['javascript:alert(1)', '//evil.example/x', 'http://plain.example', 'data:text/html;base64,xx'] as $href) {
            $html = $this->renderer->renderHtml("[Click]({$href})", []);
            $this->assertStringNotContainsString('<a ', $html, $href);
        }
        $this->assertSame('<p><a href="https://ev.example/account/orders">Orders</a></p>', $this->renderer->renderHtml('[Orders](/account/orders)', []));
    }

    public function test_link_built_from_a_variable_is_validated_after_substitution(): void
    {
        $this->assertStringNotContainsString('<a ', $this->renderer->renderHtml('[Go]({{url}})', ['url' => 'javascript:alert(1)']));
        $this->assertSame('<p><a href="https://ev.example/x">Go</a></p>', $this->renderer->renderHtml('[Go]({{url}})', ['url' => '/x']));
    }

    public function test_unknown_braced_variables_render_blank_and_colon_words_stay_literal(): void
    {
        $this->assertSame('Hi , time: 10:30', $this->renderer->renderText('Hi {{unknown}}, time: 10:30', []));
        $this->assertSame('Order ORD-1', $this->renderer->renderText('Order :order_number', ['order_number' => 'ORD-1'], ['order_number']));
    }

    public function test_subject_is_single_line_and_plain(): void
    {
        $this->assertSame('Order ORD-1 <b>', $this->renderer->renderSubject("Order\n{{n}} **<b>**", ['n' => 'ORD-1']));
    }

    public function test_admin_override_wins_over_lang_defaults_per_locale(): void
    {
        $override = new EmailTemplate(['key' => 'orders.confirmed', 'subject_en' => 'Custom {{order_number}}', 'subject_ar' => null]);

        $en = $this->renderer->render('orders.confirmed', 'en', ['order_number' => 'ORD-2'], $override, false);
        $ar = $this->renderer->render('orders.confirmed', 'ar', ['order_number' => 'ORD-2'], $override, false);

        $this->assertSame('Custom ORD-2', $en['subject']);
        $this->assertTrue($en['customized']);
        $this->assertSame('تم تأكيد الطلب ORD-2', $ar['subject']);
        $this->assertFalse($ar['customized']);
    }

    public function test_html_detection(): void
    {
        $this->assertTrue(EmailTemplateRenderer::containsHtml('<script>'));
        $this->assertTrue(EmailTemplateRenderer::containsHtml('< img src=x>'));
        $this->assertTrue(EmailTemplateRenderer::containsHtml('&lt;b&gt;'));
        $this->assertTrue(EmailTemplateRenderer::containsHtml('[x](javascript:alert(1))'));
        $this->assertFalse(EmailTemplateRenderer::containsHtml('Price < 500 EGP & free delivery: yes'));
        $this->assertFalse(EmailTemplateRenderer::containsHtml('**bold** [link](https://ev.example)'));
    }
}
