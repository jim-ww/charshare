<script lang="ts">
	const REPO_URL = "https://github.com/jim-ww/charshare";

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
