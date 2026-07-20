<script lang="ts">
	// Satoshi (headings/UI labels) is vendored in static/fonts/ — Fontshare
	// fonts aren't on npm; its @font-face lives in app.css. Inter (body) and
	// Fira Mono (monospace) come from @fontsource like before.
	import '../app.css';
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/fira-mono/400.css';
	import '@fontsource/fira-mono/500.css';

	let { children } = $props();
</script>

{@render children()}
