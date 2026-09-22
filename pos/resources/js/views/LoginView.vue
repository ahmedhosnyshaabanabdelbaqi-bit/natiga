<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { readStorage, TERMINAL_KEY } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const auth = useAuthStore();
const theme = useThemeStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const pin = ref('');
const terminal = ref(readStorage(TERMINAL_KEY) ?? 'POS1');
const mode = ref<'password' | 'pin'>('password');

onMounted(() => {
    // العودة من شاشة مقفلة: نفس المستخدم، ورمز PIN يكفي.
    if (auth.locked && auth.user) {
        mode.value = 'pin';
        username.value = auth.user.username;
    }
});

async function submit() {
    const ok =
        mode.value === 'pin'
            ? await auth.unlock(username.value, pin.value)
            : await auth.login(username.value, password.value, terminal.value);

    if (ok) router.push((route.query.redirect as string) || '/pos');
}
</script>

<template>
    <div dir="rtl" class="relative flex min-h-screen items-center justify-center bg-chrome p-4">
        <!-- خلفية هادئة: تدرّج واحد، بلا زخرفة تشتت -->
        <div
            class="pointer-events-none absolute inset-0 opacity-70"
            style="background: radial-gradient(70rem 40rem at 70% -10%, #0d8f8033, transparent 60%)"
        ></div>

        <button
            class="absolute end-4 top-4 grid size-9 place-items-center rounded-md bg-white/10 text-white/70 t-fast hover:bg-white/20"
            :title="theme.isDark ? 'الوضع النهاري' : 'الوضع الليلي'"
            :aria-label="theme.isDark ? 'الوضع النهاري' : 'الوضع الليلي'"
            @click="theme.toggle()"
        >
            <AppIcon :name="theme.isDark ? 'sun' : 'moon'" :size="17" />
        </button>

        <form class="relative w-full max-w-sm rounded-xl border border-line bg-surface-1 p-6 shadow-panel" @submit.prevent="submit">
            <div class="flex flex-col items-center gap-2.5">
                <span class="grid size-12 place-items-center rounded-xl bg-brand text-white shadow-md">
                    <AppIcon name="cart" :size="24" />
                </span>
                <h1 class="text-xl font-black">نظام نقاط البيع</h1>
                <p class="text-sm text-ink-subtle">
                    {{ mode === 'pin' ? 'أدخل رمز الدخول للعودة' : 'تسجيل الدخول' }}
                </p>
            </div>

            <div class="mt-6 space-y-3">
                <label class="block text-sm font-bold">
                    اسم المستخدم
                    <input v-model="username" autocomplete="username" class="field mt-1.5" />
                </label>

                <template v-if="mode === 'password'">
                    <label class="block text-sm font-bold">
                        كلمة المرور
                        <input v-model="password" type="password" autocomplete="current-password" class="field mt-1.5" />
                    </label>

                    <label class="block text-sm font-bold">
                        كود جهاز الكاشير
                        <input v-model="terminal" class="field mt-1.5" />
                    </label>
                </template>

                <label v-else class="block text-sm font-bold">
                    رمز الدخول (PIN)
                    <input
                        v-model="pin"
                        type="password"
                        inputmode="numeric"
                        class="num field-lg mt-1.5 text-center !text-2xl tracking-[0.5em]"
                    />
                </label>
            </div>

            <p
                v-if="auth.error"
                class="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-bold text-danger"
                role="alert"
            >
                <AppIcon name="alert" :size="16" class="mt-0.5" />
                {{ auth.error }}
            </p>

            <button
                type="submit"
                class="t-pop mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 font-black text-white t-fast hover:bg-brand-strong disabled:opacity-50"
                :disabled="auth.loading"
            >
                <AppIcon :name="auth.loading ? 'sync' : 'logout'" :size="18" />
                {{ auth.loading ? 'جارٍ التحقق…' : 'دخول' }}
            </button>

            <button
                type="button"
                class="mt-3 w-full text-center text-xs font-bold text-ink-subtle t-fast hover:text-brand"
                @click="mode = mode === 'pin' ? 'password' : 'pin'"
            >
                {{ mode === 'pin' ? 'الدخول بكلمة المرور' : 'الدخول برمز PIN' }}
            </button>
        </form>
    </div>
</template>
