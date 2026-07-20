<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { asset, resolve } from "$app/paths";
	import { externalLink, isWailsDesktop } from "$lib/wails";
	import { m } from "$lib/paraglide/messages.js";

	// In the Wails desktop build, the marketing landing page is only useful
	// the very first time the app is ever launched — every later launch
	// should drop straight into the app instead. localStorage (not
	// sessionStorage) so this survives across restarts: it's set once, on
	// that first launch, and checked on every launch after. isWailsDesktop()
	// is false in the web build, so this is a no-op there — the landing page
	// stays the normal entry point when just visiting the site.
	const SKIP_LANDING_KEY = "charshare:skippedInitialLanding";
	onMount(() => {
		if (!isWailsDesktop()) return;
		if (localStorage.getItem(SKIP_LANDING_KEY)) {
			goto(resolve("/chats"), { replaceState: true });
		} else {
			localStorage.setItem(SKIP_LANDING_KEY, "true");
		}
	});

	const REPO_URL = "https://github.com/jim-ww/charshare";
	const XMR_ADDRESS =
		"83YGRqP8uHed6NeegZQeX9ccCxbzoRHHEEi7pTwk4aqdJZEVXXA6NWtetnsEM2v33zFBBt3Rp6DNhU9qhJEGPspU14yN8t7";

	let copied = $state(false);
	async function copyAddress() {
		await navigator.clipboard.writeText(XMR_ADDRESS);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const strengths = [
		{
			title: m.landing_strength_no_account_title(),
			body: m.landing_strength_no_account_body(),
		},
		{
			title: m.landing_strength_your_data_title(),
			body: m.landing_strength_your_data_body(),
		},
		{
			title: m.landing_strength_ungovernable_title(),
			body: m.landing_strength_ungovernable_body(),
		},
		{
			title: m.landing_strength_free_title(),
			body: m.landing_strength_free_body(),
		},
	];

	const techTabs = [
		{
			id: "architecture",
			label: m.landing_tech_architecture_label(),
			heading: m.landing_tech_architecture_heading(),
			body: m.landing_tech_architecture_body(),
		},
		{
			id: "identity",
			label: m.landing_tech_identity_label(),
			heading: m.landing_tech_identity_heading(),
			body: m.landing_tech_identity_body(),
		},
		{
			id: "selfhost",
			label: m.landing_tech_selfhost_label(),
			heading: m.landing_tech_selfhost_heading(),
			body: m.landing_tech_selfhost_body(),
		},
		{
			id: "license",
			label: m.landing_tech_license_label(),
			heading: m.landing_tech_license_heading(),
			body: m.landing_tech_license_body(),
		},
	];

	let activeTab = $state(techTabs[0].id);
	const active = $derived(techTabs.find((t) => t.id === activeTab)!);

	const providerTabs = [
		{
			id: "huggingface",
			label: m.landing_provider_huggingface_label(),
			heading: m.landing_provider_huggingface_label(),
			steps: [
				m.landing_provider_huggingface_step1(),
				m.landing_provider_huggingface_step2(),
				m.landing_provider_huggingface_step3(),
				m.landing_provider_huggingface_step4(),
			],
		},
		{
			id: "openrouter",
			label: m.landing_provider_openrouter_label(),
			heading: m.landing_provider_openrouter_label(),
			steps: [
				m.landing_provider_openrouter_step1(),
				m.landing_provider_openrouter_step2(),
				m.landing_provider_openrouter_step3(),
				m.landing_provider_openrouter_step4(),
				m.landing_provider_openrouter_step5(),
			],
		},
		{
			id: "ollama",
			label: m.landing_provider_ollama_label(),
			heading: m.landing_provider_ollama_label(),
			steps: [
				m.landing_provider_ollama_step1(),
				m.landing_provider_ollama_step2(),
				m.landing_provider_ollama_step3(),
				m.landing_provider_ollama_step4(),
				m.landing_provider_ollama_step5(),
			],
		},
	];

	let activeProviderTab = $state(providerTabs[0].id);
	const activeProvider = $derived(
		providerTabs.find((t) => t.id === activeProviderTab)!,
	);
</script>

<svelte:head>
	<title>Charshare — decentralized AI characters</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-6 py-16">
	<section class="flex flex-col items-center gap-6 py-16 text-center">
		<img
			src={asset("/logo_round.png")}
			alt="Charshare"
			class="h-32 w-32"
		/>
		<h1 class="text-4xl font-bold tracking-tight sm:text-5xl">
			{m.landing_hero_title()}
		</h1>
		<p class="max-w-2xl text-lg text-base-content/70">
			{m.landing_hero_subtitle()}
		</p>
		<div
			class="flex flex-wrap items-center justify-center gap-3 pt-2"
		>
			<a
				href={resolve("/characters")}
				class="btn btn-primary btn-lg"
				>{m.landing_cta_chat()}</a
			>
			<a
				href={REPO_URL}
				class="btn btn-lg btn-outline"
				target="_blank"
				rel="noreferrer"
				use:externalLink
			>
				{m.landing_cta_view_source()}
			</a>
		</div>
	</section>

	<section class="grid grid-cols-1 gap-6 py-12 sm:grid-cols-2">
		{#each strengths as s (s.title)}
			<div
				class="card border-2 border-base-content/15 bg-base-100 shadow-sm"
			>
				<div class="card-body">
					<h2 class="card-title">{s.title}</h2>
					<p class="text-base-content/70">
						{s.body}
					</p>
				</div>
			</div>
		{/each}
	</section>

	{#if !isWailsDesktop()}
		<!-- "How to install" is meaningless from inside the desktop app you've
		     already installed and are currently running. -->
		<section class="py-12">
			<h2 class="pb-2 text-center text-2xl font-bold tracking-tight">
				{m.landing_install_heading()}
			</h2>
			<p class="pb-8 text-center text-base-content/70">
				{m.landing_install_body_before()}
				<a href={resolve("/characters")} class="link"
					>/characters</a
				>
				{m.landing_install_body_after()}
			</p>

			<div class="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
				<div
					class="card border-2 border-base-content/15 bg-base-100 shadow-sm"
				>
					<div class="card-body">
						<h3 class="card-title text-base">
							{m.landing_download_binary_heading()}
						</h3>
						<p class="text-base-content/70">
							{m.landing_download_binary_body()}
						</p>
						<div class="card-actions pt-2">
							<a
								href="{REPO_URL}/releases"
								class="btn btn-soft btn-sm"
								target="_blank"
								rel="noreferrer"
								use:externalLink
							>
								{m.landing_github_releases()}
							</a>
						</div>
					</div>
				</div>

				<div
					class="card border-2 border-base-content/15 bg-base-100 shadow-sm"
				>
					<div class="card-body">
						<h3 class="card-title text-base">
							{m.landing_nix_heading()}
						</h3>
						<p class="text-base-content/70">
							{m.landing_nix_body()}
						</p>
						<pre
							class="mt-1 overflow-x-auto rounded-box bg-base-200 p-3 text-sm"><code
								>nix run github:jim-ww/charshare</code
							></pre>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<section class="py-12">
		<h2 class="pb-2 text-center text-2xl font-bold tracking-tight">
			{m.landing_getting_started_heading()}
		</h2>
		<p class="pb-8 text-center text-base-content/70">
			{m.landing_getting_started_body()}
		</p>

		<div class="mx-auto flex max-w-3xl flex-col gap-6 sm:flex-row">
			<div
				role="tablist"
				class="flex w-full shrink-0 flex-row gap-2 overflow-x-auto sm:w-40 sm:flex-col sm:overflow-visible"
			>
				{#each providerTabs as tab (tab.id)}
					<button
						role="tab"
						type="button"
						class="btn btn-soft btn-sm justify-start whitespace-nowrap {activeProviderTab ===
						tab.id
							? 'btn-primary'
							: ''}"
						onclick={() =>
							(activeProviderTab =
								tab.id)}
					>
						{tab.label}
					</button>
				{/each}
			</div>

			<div
				class="flex-1 rounded-box border border-base-300 bg-base-100 p-6"
			>
				<h3 class="pb-3 text-lg font-semibold">
					{activeProvider.heading}
				</h3>
				<ol
					class="list-decimal space-y-2 pl-5 text-base-content/70"
				>
					{#each activeProvider.steps as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			</div>
		</div>
	</section>

	<section class="py-12">
		<h2 class="pb-2 text-center text-2xl font-bold tracking-tight">
			{m.landing_how_it_works_heading()}
		</h2>
		<p class="pb-8 text-center text-base-content/70">
			{m.landing_how_it_works_body()}
		</p>

		<div role="tablist" class="tabs-boxed tabs justify-center">
			{#each techTabs as tab (tab.id)}
				<button
					role="tab"
					type="button"
					class="tab"
					class:tab-active={activeTab === tab.id}
					onclick={() => (activeTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<div
			class="mx-auto mt-6 max-w-2xl rounded-box border border-base-300 bg-base-100 p-6"
		>
			<h3 class="pb-2 text-lg font-semibold">
				{active.heading}
			</h3>
			<p class="text-base-content/70">{active.body}</p>
		</div>
	</section>

	<section class="py-12">
		<h2 class="pb-2 text-center text-2xl font-bold tracking-tight">
			{m.landing_support_heading()}
		</h2>
		<p class="pb-6 text-center text-base-content/70">
			{m.landing_support_body()}
		</p>

		<div
			class="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-box border border-base-300 bg-base-100 p-6"
		>
			<span class="text-sm font-medium text-base-content/70"
				>{m.landing_xmr_label()}</span
			>
			<code class="break-all text-center text-sm"
				>{XMR_ADDRESS}</code
			>
			<button
				type="button"
				class="btn btn-soft btn-sm"
				onclick={copyAddress}
			>
				{copied
					? m.landing_copied()
					: m.landing_copy_address()}
			</button>
		</div>
	</section>

	<footer
		class="flex flex-col items-center gap-2 border-t border border-base-300 py-10 text-sm text-base-content/60"
	>
		<div class="flex gap-4">
			<a
				href={REPO_URL}
				target="_blank"
				rel="noreferrer"
				use:externalLink
				class="link link-hover"
				>{m.landing_footer_github()}</a
			>
			<a href={resolve("/legal/license")} class="link link-hover">
				{m.landing_footer_license()}
			</a>
			<a href={resolve("/legal")} class="link link-hover"
				>{m.landing_footer_legal()}</a
			>
			<a href={resolve("/characters")} class="link link-hover"
				>{m.landing_footer_open_app()}</a
			>
		</div>
	</footer>
</div>
