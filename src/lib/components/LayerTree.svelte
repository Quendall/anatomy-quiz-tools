<script lang="ts">
	import { ChevronRight, Eye, EyeOff, Search } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { groupKey, partIndex, SYSTEMS, type SystemDef } from '#lib/data/systems.ts';
	import { scene } from '#lib/state/scene.svelte.ts';
	import { viewer } from '#lib/viewer/api.ts';

	let query = $state('');
	const openSystems = new SvelteSet<string>(['skeletal']);
	const openGroups = new SvelteSet<string>();

	const q = $derived(query.trim().toLowerCase());

	/** Systems → groups → parts, filtered by the search box. */
	const tree = $derived(
		SYSTEMS.map((system) => {
			const groups = system.groups
				.map((g) => ({
					...g,
					key: groupKey(system.id, g.id),
					parts: q
						? g.parts.filter((p) => p.name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
						: g.parts
				}))
				.filter((g) => g.parts.length);
			const count = groups.reduce((n, g) => n + g.parts.length, 0);
			return { system, groups, count };
		}).filter((s) => !q || s.count)
	);

	function systemOpen(id: string) {
		return q ? true : openSystems.has(id);
	}
	function groupOpen(key: string) {
		return q ? true : openGroups.has(key);
	}

	function toggleSystemVisible(s: SystemDef) {
		scene.showSystem(s.id, scene.hiddenSystems.has(s.id));
	}

	// When a part is picked in the 3D view, reveal it in the tree.
	$effect(() => {
		const id = scene.focus;
		if (!id) return;
		const e = partIndex.get(id);
		if (!e) return;
		openSystems.add(e.system.id);
		openGroups.add(groupKey(e.system.id, e.group.id));
		tick().then(() =>
			document.getElementById(`part-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		);
	});
</script>

<div class="search">
	<label>
		<Search size={16} aria-hidden="true" />
		<input type="search" bind:value={query} placeholder="Search structures" aria-label="Search structures" />
	</label>
</div>

<ul class="tree" role="tree" aria-label="Anatomy structures">
	{#each tree as { system, groups, count } (system.id)}
		{@const sysVisible = !scene.hiddenSystems.has(system.id)}
		{@const sOpen = systemOpen(system.id)}
		<li role="treeitem" aria-expanded={system.available ? sOpen : undefined} aria-selected="false">
			<div class="row system" class:dim={!sysVisible || !system.available}>
				<button
					class="label"
					disabled={!system.available}
					onclick={() => scene.toggleIn(openSystems, system.id)}
				>
					<ChevronRight size={14} class="chev {sOpen && system.available ? 'open' : ''}" aria-hidden="true" />
					<span class="swatch" style:background={system.color} aria-hidden="true"></span>
					<span class="text">{system.name}</span>
					<span class="count">{system.available ? count : 'Soon'}</span>
				</button>
				{#if system.available}
					<button
						class="eye"
						onclick={() => toggleSystemVisible(system)}
						aria-pressed={sysVisible}
						aria-label="{sysVisible ? 'Hide' : 'Show'} {system.name}"
					>
						{#if sysVisible}<Eye size={18} />{:else}<EyeOff size={18} />{/if}
					</button>
				{/if}
			</div>

			{#if system.available && sOpen}
				<ul role="group" class="groups">
					{#each groups as g (g.key)}
						{@const gVisible = sysVisible && !scene.hiddenGroups.has(g.key)}
						{@const gOpen = groupOpen(g.key)}
						<li role="treeitem" aria-expanded={gOpen} aria-selected="false">
							<div class="row group" class:dim={!gVisible}>
								<button class="label" onclick={() => scene.toggleIn(openGroups, g.key)}>
									<ChevronRight size={12} class="chev {gOpen ? 'open' : ''}" aria-hidden="true" />
									<span class="text">{g.name}</span>
									<span class="count">{g.parts.length}</span>
								</button>
								<button
									class="eye"
									onclick={() => scene.toggleIn(scene.hiddenGroups, g.key)}
									aria-pressed={gVisible}
									aria-label="{gVisible ? 'Hide' : 'Show'} {g.name}"
								>
									{#if gVisible}<Eye size={16} />{:else}<EyeOff size={16} />{/if}
								</button>
							</div>
							{#if gOpen}
								<ul role="group" class="parts">
									{#each g.parts as p (p.id)}
										{@const pVisible = gVisible && !scene.hiddenParts.has(p.id)}
										{@const sel = scene.selected.has(p.id)}
										<li role="treeitem" aria-selected={sel} id="part-{p.id}">
											<div class="row part" class:dim={!pVisible} class:sel class:hov={scene.hovered === p.id}>
												<button
													class="label"
													onclick={() => scene.toggleSelect(p.id)}
													ondblclick={() => viewer.frameParts([p.id])}
													onmouseenter={() => (scene.hovered = p.id)}
													onmouseleave={() => scene.hovered === p.id && (scene.hovered = null)}
												>
													<span class="dot" style:background={sel ? 'var(--highlight)' : system.color} aria-hidden="true"></span>
													<span class="text">{p.name}</span>
													{#if p.sides}<span class="lr" title="Left and right">L/R</span>{/if}
												</button>
												<button
													class="eye"
													onclick={() => scene.toggleIn(scene.hiddenParts, p.id)}
													aria-pressed={pVisible}
													aria-label="{pVisible ? 'Hide' : 'Show'} {p.name}"
												>
													{#if pVisible}<Eye size={15} />{:else}<EyeOff size={15} />{/if}
												</button>
											</div>
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
	{#if !tree.length}
		<li class="empty">No structures match “{query}”.</li>
	{/if}
</ul>

<style>
	.search {
		padding: 0 12px 10px;
	}
	.search label {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 12px;
		border-radius: var(--radius);
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--faint);
	}
	.search label:focus-within {
		border-color: var(--accent);
	}
	.search input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tree {
		flex: 1;
		overflow-y: auto;
		padding: 0 6px 16px;
	}
	.groups {
		margin-left: 15px;
		padding-left: 12px;
		border-left: 1px solid var(--border-soft);
	}
	.parts {
		padding: 2px 0 6px 18px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: var(--radius-sm);
	}
	.row.dim .label {
		opacity: 0.45;
	}
	.row.sel {
		background: var(--highlight-bg);
	}
	.row.hov:not(.sel) {
		background: var(--panel-2);
	}
	.label {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 8px;
		border: none;
		background: transparent;
		color: var(--text-2);
		text-align: left;
	}
	.label:disabled {
		cursor: default;
	}
	.system .label {
		height: 40px;
		font-weight: 600;
		color: var(--text);
	}
	.group .label {
		height: 36px;
		font-size: 13px;
		font-weight: 500;
	}
	.part .label {
		height: 32px;
		font-size: 13px;
	}
	.row.sel .label {
		color: var(--highlight-soft);
	}
	.text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count,
	.lr {
		font-size: 11px;
		color: var(--faint);
		font-weight: 500;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		flex: none;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex: none;
	}
	.label :global(.chev) {
		flex: none;
		color: var(--faint);
		transition: transform 0.15s;
	}
	.label :global(.chev.open) {
		transform: rotate(90deg);
	}
	.eye {
		flex: none;
		width: 34px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted);
	}
	.eye[aria-pressed='false'] {
		color: var(--disabled);
	}
	.eye:hover,
	.label:not(:disabled):hover {
		background: var(--panel-2);
	}
	.empty {
		padding: 16px;
		color: var(--muted);
	}
</style>
