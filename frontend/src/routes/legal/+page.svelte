<script lang="ts">
	import { resolve } from "$app/paths";
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.legal_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-16">
	<h1 class="pb-8 text-3xl font-bold tracking-tight">{m.legal_heading()}</h1>

	<div class="flex flex-col gap-8 text-base-content/80">
		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				{m.legal_software_not_service_heading()}
			</h2>
			<p>
				{m.legal_software_not_service_body()}
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				{m.legal_no_moderation_heading()}
			</h2>
			<p>
				{m.legal_no_moderation_body()}
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				{m.legal_your_responsibility_heading()}
			</h2>
			<p>
				{m.legal_your_responsibility_body()}
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				{m.legal_third_party_heading()}
			</h2>
			<p>
				{m.legal_third_party_body()}
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				{m.legal_no_warranty_heading()}
			</h2>
			<p>
				{m.legal_no_warranty_body_before()}
				<a href={resolve("/legal/license")} class="link"
					>{m.legal_no_warranty_license_link()}</a
				>{m.legal_no_warranty_body_after()}
			</p>
		</section>
	</div>

	<div class="pt-12">
		<a href={resolve("/")} class="link link-hover">{m.legal_back_home()}</a>
	</div>
</div>
