<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<div class="empty">
	<p>No parts are selected for this quiz.</p>
	<a class="btn btn-primary" href={resolve('/quiz')}>Choose what to study</a>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		color: var(--text-2);
	}
	p {
		margin: 0;
	}
</style>
