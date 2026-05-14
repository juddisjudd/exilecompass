<script lang="ts">
	import '@fontsource/inter-tight/400.css';
	import '@fontsource/inter-tight/500.css';
	import '@fontsource/inter-tight/600.css';
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';

	let { children } = $props();
</script>

<div style="display:none">
	{#each locales as locale (locale)}
		<a
			href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}
		>{locale}</a>
	{/each}
</div>

{@render children()}
