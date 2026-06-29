let visited = new Set<number>();

// Return true when there is a path
const bfs = (
  graph: Map<number, Set<number>>,
  origin: number,
  destination: number,
) => {
  if (destination === origin) return true;

  const paths = graph.get(origin);
  if (!paths) {
    return false;
  }

  for (let s of paths) {
    if (!visited.has(s)) {
      visited.add(s);
      const result = bfs(graph, s, destination);
      if (result) return true;
    }
  }

  return false;
};

function friendRequests(
  n: number,
  restrictions: number[][],
  requests: number[][],
): boolean[] {
  const graph = new Map<number, Set<number>>();
  const answers = [];

  for (let i = 0; i < requests.length; i++) {
    const [a, b] = requests[i];
    if (graph.get(a)) {
      let setA = graph.get(a);
      setA?.add(b);
    } else {
      graph.set(a, new Set([b]));
    }

    if (graph.get(b)) {
      let setB = graph.get(b);
      setB?.add(a);
    } else {
      graph.set(b, new Set([a]));
    }

    let possible = true;
    for (let j = 0; j < restrictions.length; j++) {
      const [c, d] = restrictions[j];
      visited = new Set<number>();
      const result = bfs(graph, c, d);
      if (result) {
        possible = false;
        answers.push(false);
        let setA = graph.get(a);
        setA?.delete(b);
        let setB = graph.get(b);
        setB?.delete(a);
        break;
      }
    }
    if (possible) {
      answers.push(true);
    }
  }

  return answers;
}
