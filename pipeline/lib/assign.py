"""Static traffic assignment: conjugate Frank-Wolfe for UE and SO.

Link cost t(x) = free_time + coef * x**power (minutes). BPR maps to this as
free_time = t0, coef = t0 * alpha / capacity**beta, power = beta.

UE minimizes the Beckmann objective (drivers pick their own fastest route);
SO minimizes total travel time, which is UE on marginal cost t(x) + x t'(x).
Conjugate FW: Mitradjieva & Lindberg (2013), "The stiff is moving".
Keep in sync with web/src/solver/frankWolfe.ts.
"""

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

_EPS_WEIGHT = 1e-9  # csgraph may drop zero-weight edges; keep them present
_DELTA = 1e-6       # keeps the conjugate weight away from 1


class _Network:
    """Integer-indexed graph. Parallel links get a dummy node so every
    (from, to) pair in the sparse matrix is unique."""

    def __init__(self, links):
        self.ids = [l["id"] for l in links]
        self.free = np.array([l["free_time"] for l in links], dtype=float)
        self.coef = np.array([l["coef"] for l in links], dtype=float)
        self.power = np.array([l["power"] for l in links], dtype=float)

        self.node_index = {}
        idx = lambda n: self.node_index.setdefault(n, len(self.node_index))
        tails, heads, seen = [], [], set()
        self.dummy_of = {}  # link index -> dummy node sitting before its head
        for k, l in enumerate(links):
            a, b = idx(l["a_node"]), idx(l["b_node"])
            if (a, b) in seen:
                d = idx(("__dummy__", k))
                self.dummy_of[k] = d
                tails.append(a)
                heads.append(d)
            else:
                seen.add((a, b))
                tails.append(a)
                heads.append(b)
        # Edges in the sparse graph: one per link, plus a zero-cost edge dummy -> head.
        self.n_links = len(links)
        extra_t = list(self.dummy_of.values())
        extra_h = [self.node_index[links[k]["b_node"]] for k in self.dummy_of]
        self.tail = np.array(tails + extra_t)
        self.head = np.array(heads + extra_h)
        self.n_nodes = len(self.node_index)
        m = len(self.tail)
        order = csr_matrix((np.arange(1, m + 1, dtype=float), (self.tail, self.head)),
                           shape=(self.n_nodes, self.n_nodes))
        self.csr_to_edge = order.data.astype(int) - 1
        self.indptr, self.indices = order.indptr, order.indices
        # edge lookup by (tail, head)
        self.edge_of = {(int(t), int(h)): e for e, (t, h) in enumerate(zip(self.tail, self.head))}

    def cost(self, x, marginal):
        c = self.free + self.coef * x ** self.power
        if marginal:
            c = c + self.coef * self.power * x ** self.power
        return c

    def cost_derivative(self, x, marginal):
        # t'(x) for UE; d/dx [t + x t'] = coef * p * (1 + p) * x**(p-1) for SO
        with np.errstate(divide="ignore", invalid="ignore"):
            d = self.coef * self.power * np.where(self.power == 1, 1.0, x ** (self.power - 1))
        d = np.nan_to_num(d)
        return d * (1 + self.power) if marginal else d


def _all_or_nothing(net, cost, od_by_origin):
    """Load all demand on shortest paths. Returns (link flows, shortest-path total cost)."""
    edge_cost = np.concatenate([cost, np.zeros(len(net.tail) - net.n_links)])
    graph = csr_matrix((edge_cost[net.csr_to_edge] + _EPS_WEIGHT, net.indices, net.indptr),
                       shape=(net.n_nodes, net.n_nodes))
    origins = list(od_by_origin)
    dist, pred = dijkstra(graph, directed=True, indices=origins, return_predecessors=True)

    edge_flow = np.zeros(len(net.tail))
    sptt = 0.0
    for row, o in enumerate(origins):
        dests, demand = od_by_origin[o]
        d_row, p_row = dist[row], pred[row]
        if np.isinf(d_row[dests]).any():
            bad = dests[np.isinf(d_row[dests])][0]
            raise ValueError(f"destination node index {bad} unreachable from origin {o}")
        sptt += float(demand @ d_row[dests])  # includes _EPS_WEIGHT per edge; negligible
        # Push demand up the shortest-path tree, farthest nodes first.
        load = np.zeros(net.n_nodes)
        np.add.at(load, dests, demand)
        reached = np.flatnonzero(load)
        todo = set(reached.tolist())
        # Only walk nodes that carry load: collect ancestors of destinations.
        stack = list(todo)
        while stack:
            v = stack.pop()
            p = p_row[v]
            if p >= 0 and p not in todo:
                todo.add(int(p))
                stack.append(int(p))
        # Children before parents: order by tree depth, not distance (zero-cost
        # links can tie distances, and the epsilon can round away at large distances).
        depth = {}
        for v in todo:
            chain = []
            while v not in depth:
                p = p_row[v]
                if p < 0:
                    depth[v] = 0
                    break
                chain.append(v)
                v = int(p)
            base = depth[v]
            for off, c in enumerate(reversed(chain), start=1):
                depth[c] = base + off
        nodes = sorted(todo, key=depth.__getitem__, reverse=True)
        load_l = load.tolist()
        for v in nodes:
            p = p_row[v]
            if p < 0 or load_l[v] == 0.0:
                continue
            edge_flow[net.edge_of[(int(p), v)]] += load_l[v]
            load_l[p] += load_l[v]

    # Fold dummy edges back onto their links (dummy -> head edges carry the same flow).
    return edge_flow[: net.n_links], sptt


def _line_search(net, x, direction, marginal, iters=60):
    """Bisection for the step in [0, 1] where the directional derivative is zero."""
    def slope(lam):
        return float(direction @ net.cost(x + lam * direction, marginal))

    if slope(1.0) <= 0:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        if slope(mid) > 0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def solve(links, od, mode="UE", max_iter=500, rel_gap=1e-5):
    """Solve UE or SO. See CLAUDE.md, Solver interface.

    links: [{id, a_node, b_node, free_time, coef, power}]
    od: [(origin, destination, demand)]
    Returns {flow, time, tstt, relative_gap, iterations} with flow/time keyed by link id.
    """
    if mode not in ("UE", "SO"):
        raise ValueError("mode must be 'UE' or 'SO'")
    marginal = mode == "SO"
    net = _Network(links)

    grouped = {}
    for o, d, q in od:
        if o == d or q <= 0:
            continue
        for n in (o, d):
            if n not in net.node_index:
                raise ValueError(f"OD node {n!r} is not in the network")
        grouped.setdefault(net.node_index[o], {}).setdefault(net.node_index[d], 0.0)
        grouped[net.node_index[o]][net.node_index[d]] += q
    od_by_origin = {o: (np.array(list(ds)), np.array(list(ds.values()))) for o, ds in grouped.items()}

    x, _ = _all_or_nothing(net, net.cost(np.zeros(net.n_links), marginal), od_by_origin)
    s_prev = None
    gap = np.inf
    it = 0
    for it in range(1, max_iter + 1):
        c = net.cost(x, marginal)
        y, sptt = _all_or_nothing(net, c, od_by_origin)
        total = float(x @ c)
        gap = (total - sptt) / total if total > 0 else 0.0
        if gap <= rel_gap:
            break

        # Conjugate direction: mix the previous target with the new AON solution.
        s = y
        if s_prev is not None:
            h = net.cost_derivative(x, marginal)
            num = float(((s_prev - x) * h) @ (y - x))
            den = float(((s_prev - x) * h) @ (y - s_prev))
            alpha = 0.0
            if den != 0:
                alpha = num / den
                alpha = 1 - _DELTA if alpha > 1 - _DELTA else max(alpha, 0.0)
            s = alpha * s_prev + (1 - alpha) * y
        step = _line_search(net, x, s - x, marginal)
        x = x + step * (s - x)
        s_prev = s

    t = net.cost(x, marginal=False)
    return {
        "flow": dict(zip(net.ids, x.tolist())),
        "time": dict(zip(net.ids, t.tolist())),
        "tstt": float(x @ t),
        "relative_gap": float(gap),
        "iterations": it,
    }
