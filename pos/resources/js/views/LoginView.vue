<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { readStorage, TERMINAL_KEY } from '@/lib/api';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const pin = ref('');
const terminal = ref(readStorage(TERMINAL_KEY) ?? 'POS1');
const mode = ref<'password' | 'pin'>('password');

onMounted(() => {
    if (auth.locked && auth.user) {
        mode.value = 'pin';
        username.value = auth.user.username;
    }
});

async function submit() {
    const ok = mode.value === 'pin'
        ? await auth.unlock(username.value, pin.value)
        : await auth.login(username.value, password.value, terminal.value);

    if (ok) router.push((route.query.redirect as string) || '/pos');
}
</script>

<template>
    <div dir="rtl" class="flex min-h-screen items-center justify-center bg-ink-900 p-4">
        <form class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" @submit.prevent="submit">
            <h1 class="text-center text-2xl font-black">نظام نقاط البيع</h1>
            <p class="mt-1 text-center text-sm text-ink-500">
                {{ mode === 'pin' ? 'أدخل رمز الدخول للعودة' : 'تسجيل الدخول' }}
            </p>

            <label class="mt-5 block text-sm font-bold">اسم المستخدم</label>
            <input v-model="username" autocomplete="username" class="mt-1 w-full rounded-xl border border-ink-300 px-3 py-2.5 outline-none focus:border-brand-600" />

            <template v-if="mode === 'password'">
                <label class="mt-3 block text-sm font-bold">كلمة المرور</label>
                <input v-model="password" type="password" autocomplete="current-password" class="mt-1 w-full rounded-xl border border-ink-300 px-3 py-2.5 outline-none focus:border-brand-600" />

                <label class="mt-3 block text-sm font-bold">كود جهاز الكاشير</label>
                <input v-model="terminal" class="mt-1 w-full rounded-xl border border-ink-300 px-3 py-2.5 outline-none focus:border-brand-600" />
            </template>

            <template v-else>
                <label class="mt-3 block text-sm font-bold">رمز الدخول (PIN)</label>
                <input v-model="pin" type="password" inputmode="numeric" class="num mt-1 w-full rounded-xl border border-ink-300 px-3 py-3 text-center text-2xl tracking-widest outline-none focus:border-brand-600" />
            </template>

            <p v-if="auth.error" class="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">
                {{ auth.error }}
            </p>

            <button
                type="submit"
                class="mt-5 w-full rounded-xl bg-brand-600 py-3 font-black text-white disabled:opacity-50"
                :disabled="auth.loading"
            >
                {{ auth.loading ? 'جارٍ التحقق…' : 'دخول' }}
            </button>

            <button
                type="button"
                class="mt-2 w-full text-center text-xs font-bold text-ink-500"
                @click="mode = mode === 'pin' ? 'password' : 'pin'"
            >
                {{ mode === 'pin' ? 'الدخول بكلمة المرور' : 'الدخول برمز PIN' }}
            </button>
        </form>
    </div>
</template>
