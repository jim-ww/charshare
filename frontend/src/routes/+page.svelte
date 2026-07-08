<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";

	// In the Wails desktop build, skip the marketing landing page on first
	// launch and go straight into the app. `window.runtime` only exists in
	// the Wails webview, so this is a no-op for the web build. Only fires
	// once — after that, visiting "/" (e.g. via the logo) stays put.
	const SKIP_LANDING_KEY = "charshare:skippedInitialLanding";
	onMount(() => {
		if (
			(window as unknown as { runtime?: unknown }).runtime &&
			!localStorage.getItem(SKIP_LANDING_KEY)
		) {
			localStorage.setItem(SKIP_LANDING_KEY, "true");
			goto("/characters", { replaceState: true });
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
			title: "No account needed",
			body: "Generate a local identity and start creating characters and chatting immediately. Publishing to the network is optional, and only your choice.",
		},
		{
			title: "Your data stays yours",
			body: "Chats, personas, and preferences never leave your device — no server of ours ever sees them. You also pick your own AI provider, so even the messages you send to generate a reply go straight to a service you chose, not one we run.",
		},
		{
			title: "Ungovernable by design",
			body: "No company, no terms of service, no moderation queue. Nobody has the power to tell you what characters you can write, ban your account, or take away your access — because there's no server, and no one, in a position to.",
		},
		{
			title: "Free, as in freedom",
			body: "Charshare is AGPLv3 software you run and own a copy of. Modify it, fork it, self-host a relay — the code you can read is the whole product.",
		},
	];

	const techTabs = [
		{
			id: "architecture",
			label: "Architecture",
			heading: "No backend, no server",
			body: "Charshare ships as a static site — deployable from any CDN, with no server component at all. Anything you publish travels over GUN, a peer-to-peer graph database, through relays that anyone can run. When you chat, your browser talks directly to whichever AI provider you've configured — there's no proxy of ours in between.",
		},
		{
			id: "identity",
			label: "Identity & Signing",
			heading: "Your keypair is your account",
			body: "Every user and character is identified by a public key, not a separate username or database row. Documents are canonicalized and signed with GUN SEA (ECDSA P-256); peers verify signatures client-side before trusting anything. That signature is cryptographic proof of ownership — only the holder of the private key can publish an edit, so authorship can't be forged or reassigned by anyone else, including a relay. There's no password to leak, because there's no password.",
		},
		{
			id: "selfhost",
			label: "Self-hosting",
			heading: "Run your own relay",
			body: "Sensible default relays are provided, but every relay is user-configurable and self-hostable. Nothing about using Charshare requires trusting a relay you didn't choose — data is signed and verified independent of which relay carried it.",
		},
		{
			id: "license",
			label: "License",
			heading: "AGPLv3, distributed as software",
			body: "Charshare is licensed AGPLv3: free to run, study, modify, and redistribute. It's built and shipped as software you own a copy of, not a service you rent — there is no subscription, and there's nothing to cancel.",
		},
	];

	let activeTab = $state(techTabs[0].id);
	const active = $derived(techTabs.find((t) => t.id === activeTab)!);

	const providerTabs = [
		{
			id: "huggingface",
			label: "Hugging Face",
			heading: "Hugging Face",
			steps: [
				"Create a Hugging Face account and generate an access token with inference permissions.",
				'In Charshare Settings → AI tab, select "Hugging Face" and paste in your token.',
				"Enter the model id you want to use for inference.",
				"Start chatting — calls go directly from your browser to Hugging Face's inference API.",
			],
		},
		{
			id: "openrouter",
			label: "OpenRouter",
			heading: "OpenRouter",
			steps: [
				"Create an account at openrouter.ai and generate an API key.",
				"In Charshare, open Settings (your avatar, top right) → AI tab.",
				'Select "OpenRouter" as the provider and paste in your API key.',
				"Enter a model id, e.g. openai/gpt-4o or any model listed on OpenRouter.",
				"Start chatting — requests go straight from your browser to OpenRouter; your key never leaves your device.",
			],
		},
		{
			id: "ollama",
			label: "Ollama",
			heading: "Ollama",
			steps: [
				"Install Ollama on your own machine (or a server you control) and pull a model, e.g. ollama pull llama3.",
				"Make sure Ollama is running and reachable — by default at http://localhost:11434.",
				'In Charshare Settings → AI tab, select "Ollama" and enter the server URL.',
				"Enter the model name you pulled.",
				"No API key needed — the model runs entirely on hardware you control.",
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
		<h1 class="text-4xl font-bold tracking-tight sm:text-5xl">
			Your characters. Your chats. Your rules.
		</h1>
		<p class="max-w-2xl text-lg text-base-content/70">
			Charshare is a decentralized platform for AI characters.
			No account required, no moderation queue, no
			subscription. Everything lives on your device first —
			publish to the network only if you want to.
		</p>
		<div
			class="flex flex-wrap items-center justify-center gap-3 pt-2"
		>
			<a href="/characters" class="btn btn-primary btn-lg"
				>Chat with characters</a
			>
			<a
				href={REPO_URL}
				class="btn btn-lg btn-outline"
				target="_blank"
				rel="noreferrer"
			>
				View source
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

	<section class="py-12">
		<h2 class="pb-2 text-center text-2xl font-bold tracking-tight">
			Getting started
		</h2>
		<p class="pb-8 text-center text-base-content/70">
			Charshare works with several AI providers — pick
			whichever fits how you want to run it.
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
			How it works
		</h2>
		<p class="pb-8 text-center text-base-content/70">
			A closer look at how Charshare works under the hood.
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
			Support the project
		</h2>
		<p class="pb-6 text-center text-base-content/70">
			Charshare has no subscription and no ads, and never
			will. If you'd like to support it anyway, donations are
			welcome via Monero.
		</p>

		<div
			class="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-box border border-base-300 bg-base-100 p-6"
		>
			<span class="text-sm font-medium text-base-content/70"
				>XMR address</span
			>
			<code class="break-all text-center text-sm"
				>{XMR_ADDRESS}</code
			>
			<button
				type="button"
				class="btn btn-soft btn-sm"
				onclick={copyAddress}
			>
				{copied ? "Copied!" : "Copy address"}
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
				class="link link-hover">GitHub</a
			>
			<a
				href="{REPO_URL}/blob/main/LICENSE"
				target="_blank"
				rel="noreferrer"
				class="link link-hover"
			>
				AGPLv3 License
			</a>
			<a href="/characters" class="link link-hover"
				>Open the app</a
			>
		</div>
	</footer>
</div>
