<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ChevronRight, Copy, Crosshair, ListChecks, Minus, Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { groupKey, SYSTEMS } from '#lib/data/systems.ts';
	import { quiz, type QuizMode } from '#lib/state/quiz.svelte.ts';
	import { scene } from '#lib/state/scene.svelte.ts';

	const checked = new SvelteSet<string>(quiz.settings.scope);
	const open = new SvelteSet<string>(['skeletal']);
	const systems = SYSTEMS.filter((s) => s.available);
	const s = $derived(quiz.settings);

	// Keep the saved study set in sync with the checkboxes.
	$effect(() => {
		const scope = [...checked];
		if (scope.join('|') !== quiz.settings.scope.join('|')) quiz.update({ scope });
	});

	function setMany(ids: string[], on: boolean) {
		for (const id of ids) {
			if (on) checked.add(id);
			else checked.delete(id);
		}
	}
	const countIn = (ids: string[]) => ids.filter((id) => checked.has(id)).length;

	/** Checkbox `indeterminate` is a DOM property, not an attribute. */
	const mixed = (on: boolean) => (el: HTMLInputElement) => {
		el.indeterminate = on;
	};

	const PRESET_LABEL: Record<string, string> = {
		skeletal: 'Whole skeleton',
		joints: 'All joints & ligaments',
		muscular: 'All muscles',
		visceral: 'All organs',
		cardiovascular: 'Heart & vessels'
	};
	const viewerSel = $derived([...scene.selected]);
	const presets = $derived([
		...systems.map((s) => ({
			label: PRESET_LABEL[s.id] ?? `All of ${s.name}`,
			ids: s.groups.flatMap((g) => g.parts.map((p) => p.id))
		})),
		...(viewerSel.length ? [{ label: `Selected in viewer (${viewerSel.length})`, ids: viewerSel }] : [])
	]);

	const MODES: { id: QuizMode; name: string; desc: string }[] = [
		{
			id: 'learn',
			name: 'Learn',
			desc: 'The camera frames a highlighted part. Pick from 4 names, then type it once you know it. Missed parts come back sooner.'
		},
		{
			id: 'flashcards',
			name: 'Flashcards',
			desc: 'Flip between the 3D structure and its name. Star the hard ones and drill only those.'
		},
		{
			id: 'find',
			name: 'Find',
			desc: 'You get a name; click that part in the 3D viewer. Only parts in this quiz can be clicked.'
		}
	];
	const mode = $derived(MODES.find((m) => m.id === s.mode)!);
	const total = $derived(checked.size);
	const starredInScope = $derived([...checked].filter((id) => quiz.stars.has(id)).length);
</script>

<svelte:head><title>Start a quiz · Anatomy Quiz Tools</title></svelte:head>

<div class="setup">
	<aside class="scope" aria-label="Quiz scope">
		<div class="scope-head">
			<h2>What to study</h2>
			<p>Tick whole layers, groups or single parts.</p>
		</div>
		<div class="presets">
			{#each presets as p (p.label)}
				<button class="pill" onclick={() => (checked.clear(), setMany(p.ids, true))}>{p.label}</button>
			{/each}
			{#if checked.size}
				<button class="pill" onclick={() => checked.clear()}>Clear</button>
			{/if}
		</div>
		<ul class="tree">
			{#each systems as sys (sys.id)}
				{@const ids = sys.groups.flatMap((g) => g.parts.map((p) => p.id))}
				{@const n = countIn(ids)}
				{@const isOpen = open.has(sys.id)}
				<li>
					<div class="row sys">
						<button class="chev" onclick={() => scene.toggleIn(open, sys.id)} aria-expanded={isOpen} aria-label="{isOpen ? 'Collapse' : 'Expand'} {sys.name}">
							<ChevronRight size={14} class={isOpen ? 'open' : ''} />
						</button>
						<label>
							<input
								type="checkbox"
								checked={n === ids.length}
								{@attach mixed(n > 0 && n < ids.length)}
								onchange={() => setMany(ids, n !== ids.length)}
							/>
							<span class="swatch" style:background={sys.color} aria-hidden="true"></span>
							<span class="grow">{sys.name}</span>
							<span class="count" class:on={n > 0}>{n ? `${n} of ${ids.length}` : ids.length}</span>
						</label>
					</div>
					{#if isOpen}
						<ul class="groups">
							{#each sys.groups as g (g.id)}
								{@const gids = g.parts.map((p) => p.id)}
								{@const gn = countIn(gids)}
								{@const gk = groupKey(sys.id, g.id)}
								{@const gOpen = open.has(gk)}
								<li>
									<div class="row">
										<button class="chev" onclick={() => scene.toggleIn(open, gk)} aria-expanded={gOpen} aria-label="{gOpen ? 'Collapse' : 'Expand'} {g.name}">
											<ChevronRight size={12} class={gOpen ? 'open' : ''} />
										</button>
										<label>
											<input
												type="checkbox"
												checked={gn === gids.length}
												{@attach mixed(gn > 0 && gn < gids.length)}
												onchange={() => setMany(gids, gn !== gids.length)}
											/>
											<span class="grow">{g.name}</span>
											<span class="count" class:on={gn > 0}>{gn}/{gids.length}</span>
										</label>
									</div>
									{#if gOpen}
										<ul class="parts">
											{#each g.parts as p (p.id)}
												<li>
													<label class="part">
														<input type="checkbox" checked={checked.has(p.id)} onchange={() => setMany([p.id], !checked.has(p.id))} />
														<span>{p.name}</span>
													</label>
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</aside>

	<section class="main">
		<div class="inner">
			<header>
				<h1>Start a quiz</h1>
				<p>{total ? `${total} part${total === 1 ? '' : 's'} selected` : 'Select at least one part to start.'}</p>
			</header>

			<fieldset>
				<legend>Mode</legend>
				<div class="modes">
					{#each MODES as m (m.id)}
						<button class="mode" aria-pressed={s.mode === m.id} onclick={() => quiz.update({ mode: m.id })}>
							<span class="mode-icon" aria-hidden="true">
								{#if m.id === 'learn'}<ListChecks size={22} />{:else if m.id === 'flashcards'}<Copy size={22} />{:else}<Crosshair size={22} />{/if}
							</span>
							<span class="mode-name">{m.name}</span>
							<span class="mode-desc">{m.desc}</span>
						</button>
					{/each}
				</div>
			</fieldset>

			<div class="options">
				<h2>{mode.name} options</h2>
				{#if s.mode === 'learn'}
					<div class="opt">
						<span id="thr">Switch from multiple choice to typing after</span>
						<div class="stepper" role="group" aria-labelledby="thr">
							<button aria-label="Fewer" onclick={() => quiz.update({ threshold: Math.max(1, s.threshold - 1) })}><Minus size={16} /></button>
							<span>{s.threshold} correct</span>
							<button aria-label="More" onclick={() => quiz.update({ threshold: Math.min(5, s.threshold + 1) })}><Plus size={16} /></button>
						</div>
					</div>
					<label class="check"><input type="checkbox" checked={s.fuzzy} onchange={() => quiz.update({ fuzzy: !s.fuzzy })} />Accept answers with minor typos</label>
				{:else if s.mode === 'flashcards'}
					<div class="opt">
						<span id="front">Card front shows</span>
						<div class="seg" role="group" aria-labelledby="front">
							<button aria-pressed={s.front === 'model'} onclick={() => quiz.update({ front: 'model' })}>3D structure</button>
							<button aria-pressed={s.front === 'name'} onclick={() => quiz.update({ front: 'name' })}>Name</button>
						</div>
					</div>
					<label class="check">
						<input type="checkbox" checked={s.starredOnly} onchange={() => quiz.update({ starredOnly: !s.starredOnly })} />
						Starred cards only ({starredInScope} starred in this set)
					</label>
				{:else}
					<div class="opt">
						<span id="miss">Reveal the answer after</span>
						<div class="stepper" role="group" aria-labelledby="miss">
							<button aria-label="Fewer" onclick={() => quiz.update({ maxMisses: Math.max(1, s.maxMisses - 1) })}><Minus size={16} /></button>
							<span>{s.maxMisses} misses</span>
							<button aria-label="More" onclick={() => quiz.update({ maxMisses: Math.min(5, s.maxMisses + 1) })}><Plus size={16} /></button>
						</div>
					</div>
				{/if}
			</div>

			<div class="start">
				<button class="btn btn-primary big" disabled={!total} onclick={() => goto(resolve(`/quiz/${s.mode}` as const))}>
					Start {mode.name} <ArrowRight size={18} aria-hidden="true" />
				</button>
				<span>Progress and stars are saved in this browser.</span>
			</div>
		</div>
	</section>
</div>

<style>
	.setup {
		display: flex;
		min-height: 100%;
		height: 100%;
	}
	.scope {
		width: 360px;
		flex: none;
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border-right: 1px solid var(--border);
		min-height: 0;
	}
	.scope-head {
		padding: 20px 16px 8px 20px;
	}
	h2 {
		margin: 0 0 4px;
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 600;
	}
	.scope-head p {
		margin: 0;
		font-size: 13px;
		color: var(--muted);
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 16px 12px 20px;
	}
	.pill {
		height: 32px;
		padding: 0 12px;
		border-radius: 16px;
		border: 1px solid var(--border);
		background: var(--panel-2);
		color: var(--text-2);
		font-size: 12px;
	}
	.pill:hover {
		border-color: var(--accent);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tree {
		flex: 1;
		overflow-y: auto;
		padding: 0 8px 16px 10px;
	}
	.groups {
		margin-left: 30px;
		padding-left: 6px;
		border-left: 1px solid var(--border-soft);
	}
	.parts {
		padding-left: 34px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.chev {
		width: 30px;
		height: 36px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--faint);
	}
	.chev :global(svg) {
		transition: transform 0.15s;
	}
	.chev :global(svg.open) {
		transform: rotate(90deg);
	}
	label {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 36px;
		cursor: pointer;
		color: var(--text-2);
		font-weight: 500;
	}
	.sys label {
		height: 40px;
		font-weight: 600;
		color: var(--text);
	}
	label.part {
		height: 30px;
		font-size: 13px;
		font-weight: 400;
		color: var(--text-3);
	}
	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		margin: 0;
		flex: none;
		accent-color: var(--accent);
	}
	.grow {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-size: 12px;
		font-weight: 500;
		color: var(--faint);
		padding-right: 8px;
	}
	.count.on {
		color: var(--accent);
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}

	.main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 32px 40px 40px;
	}
	.inner {
		max-width: 920px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	h1 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	header p {
		margin: 0;
		color: var(--muted);
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
		margin-bottom: 12px;
	}
	.modes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 14px;
	}
	.mode {
		text-align: left;
		padding: 20px;
		border-radius: var(--radius-xl);
		border: 2px solid var(--border);
		background: var(--panel);
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 190px;
	}
	.mode:hover {
		border-color: #3a4553;
	}
	.mode[aria-pressed='true'] {
		border-color: var(--accent);
		background: #13252a;
	}
	.mode-icon {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: var(--bg);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-2);
	}
	.mode[aria-pressed='true'] .mode-icon {
		color: var(--accent);
	}
	.mode-name {
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 600;
	}
	.mode-desc {
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-3);
	}
	.options {
		padding: 20px 24px;
		border-radius: var(--radius-xl);
		background: var(--panel);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.options h2 {
		font-family: var(--font-body);
		font-size: 15px;
		margin: 0;
	}
	.opt {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
	}
	.opt > span {
		flex: 1;
		min-width: 220px;
		color: var(--text-2);
	}
	.check {
		flex: none;
		height: auto;
		font-weight: 400;
	}
	.stepper,
	.seg {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 3px;
	}
	.stepper button {
		width: 40px;
		height: 40px;
		border: none;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.stepper button:hover,
	.seg button:hover {
		background: var(--panel-2);
	}
	.stepper span {
		min-width: 100px;
		text-align: center;
		font-weight: 600;
	}
	.seg button {
		height: 38px;
		padding: 0 14px;
		border: none;
		border-radius: var(--radius);
		background: transparent;
	}
	.seg button[aria-pressed='true'] {
		background: var(--pressed);
	}
	.start {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px;
		font-size: 13px;
		color: var(--faint);
	}
	.big {
		height: 52px;
		padding: 0 28px;
		border-radius: var(--radius-lg);
		font-size: 16px;
		gap: 10px;
	}
	.big:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
