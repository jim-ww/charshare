<script lang="ts">
	import { resolve } from "$app/paths";
	import { m } from "$lib/paraglide/messages.js";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.legal_license_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-16">
	<h1 class="pb-8 pr-20 text-center text-3xl font-bold tracking-tight">
		{m.legal_license_heading()}
	</h1>

	<pre
		class="overflow-x-auto whitespace-pre-wrap text-sm text-base-content/80">{data.licenseText}</pre>

	<h2 class="pt-12 pb-4 text-xl font-bold tracking-tight">
		{m.legal_license_assets_heading()}
	</h2>
	<pre
		class="overflow-x-auto whitespace-pre-wrap text-sm text-base-content/80">{data.assetsLicenseText}</pre>

	<div class="pt-12">
		<a href={resolve("/legal")} class="link link-hover"
			>{m.legal_back_legal()}</a
		>
	</div>
</div>
