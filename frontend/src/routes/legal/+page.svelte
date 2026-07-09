<script lang="ts">
	import { resolve } from "$app/paths";
	import { externalLink } from "$lib/wails";
	const REPO_URL = "https://github.com/jim-ww/charshare";
</script>

<svelte:head>
	<title>Legal — Charshare</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-16">
	<h1 class="pb-8 text-3xl font-bold tracking-tight">Legal</h1>

	<div class="flex flex-col gap-8 text-base-content/80">
		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				Charshare is software, not a service
			</h2>
			<p>
				Charshare is not a service we operate. It's a static
				site you can run from any CDN, or a desktop app you
				download and run locally — either way, the same code
				runs entirely on your device. We don't run a backend,
				don't host a database of user content, and don't have
				any account system of our own to moderate. Anything
				you choose to publish is sent directly, peer-to-peer,
				over the GUN network, through relays that anyone
				(including you) can run.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				We have no ability to moderate or remove content
			</h2>
			<p>
				Because there is no central server, we have no
				technical ability to review, approve, take down, or
				otherwise control what any user publishes to the
				network, and no account system through which to ban
				anyone. Local blocking tools (blocked tags, blocked
				authors, hidden characters) exist for your own client,
				but they don't remove anything from the network — they
				only affect what your own client shows you.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				You are responsible for what you publish
			</h2>
			<p>
				If you publish a character, comment, or profile to the
				network, you are solely responsible for that content
				and for complying with the laws that apply to you in
				your jurisdiction. We do not review, endorse, or take
				responsibility for content published by any user,
				including you.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				Third-party AI providers
			</h2>
			<p>
				Charshare does not run or proxy any AI model. You
				configure your own AI provider (e.g. OpenRouter,
				Hugging Face, or a self-hosted Ollama instance) and
				your own credentials. When you chat, requests go
				directly from your device to the provider you chose —
				any data sent that way is governed by that provider's
				own terms and privacy practices, not by us.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-base-content">
				No warranty
			</h2>
			<p>
				Charshare is licensed under the
				<a
					href="{REPO_URL}/blob/main/LICENSE"
					target="_blank"
					rel="noreferrer"
					use:externalLink
					class="link">AGPLv3</a
				>, which provides the software "as is," without
				warranty of any kind, and disclaims liability to the
				fullest extent permitted by law. That disclaimer
				applies here too — use Charshare at your own risk.
			</p>
		</section>
	</div>

	<div class="pt-12">
		<a href={resolve("/")} class="link link-hover">&larr; Back home</a>
	</div>
</div>
