/** Fetch and lightly sanity-check the theory graph. */
export async function loadGraph(url = './theory_graph.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const graph = await res.json();
  if (!Array.isArray(graph.nodes)) throw new Error('graph.nodes is not an array');
  graph.edges ??= [];
  graph.clusters ??= [];
  graph.unresolved ??= [];
  graph.corpus ??= { documents: [] };
  return graph;
}
