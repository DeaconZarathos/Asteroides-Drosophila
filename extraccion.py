#!/usr/bin/env python3
"""
Extrae un subcircuito visuomotor del conectoma de FlyWire (descargas de Codex, FAFB v783)
y lo guarda como un JSON pequeño para el juego "Asteroides Drosophila".

Entradas  : neuronas columnares del ojo (Tm, Mi, T4, T5, ...), UNA por columna y por ojo,
            la que mas conecta con las neuronas LC/LPLC. Cada una lleva su posicion (x, y) en el ojo.
Salidas   : neuronas descendentes
              DNa02 + DNa01 izquierdas -> grupo 0 (giro izquierdo)
              DNa02 + DNa01 derechas   -> grupo 1 (giro derecho)
              DNp09                    -> grupo 2 (empuje)
              DNp01                    -> grupo 3 (disparo; asignacion arbitraria)
Intermedias: neuronas (entre ellas LC y LPLC) que reciben de las entradas y proyectan a las salidas.

Uso (todo en una sola linea):
  python extraccion.py --connections connections_princeton.csv.gz --cell-types tipos_celulas.csv
      --visual neuronas_visuales.csv --columns column_assignment.csv.gz
      --classification classification.csv.gz --out subcircuito.json

Requiere pandas. Lee .csv y .csv.gz (detecta gzip aunque el nombre no lo diga).
"""
import argparse, json, os, sys
import numpy as np
import pandas as pd


def rd(path, **kw):
    with open(path, "rb") as f:
        gz = f.read(2) == b"\x1f\x8b"
    return pd.read_csv(path, compression="gzip" if gz else None, **kw)


def pick(df, cands, what, required=True):
    low = {c.lower(): c for c in df.columns}
    for c in cands:
        if c.lower() in low:
            return low[c.lower()]
    if required:
        sys.exit(f"No encuentro la columna de {what}. Columnas disponibles: {list(df.columns)}\n"
                 f"Pasa el nombre correcto con las opciones --col-* o pegame este mensaje.")
    return None


def norm_side(s):
    s = str(s).strip().lower()
    if s.startswith("l"):
        return 0
    if s.startswith("r"):
        return 1
    return -1


def nt_sign(nt):
    nt = str(nt).strip().upper()
    if nt in ("GABA", "GLUT"):
        return -1.0
    if nt in ("DA", "SER", "OA"):
        return 0.5   # modulador: excitacion debil (simplificacion)
    return 1.0       # ACH y desconocidos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--connections", required=True)
    ap.add_argument("--cell-types", required=True)
    ap.add_argument("--visual", required=True)
    ap.add_argument("--columns", required=True, help="column_assignment.csv(.gz) de Codex (Visual Neuron Columns)")
    ap.add_argument("--classification", help="classification.csv(.gz) de Codex: da el lado real de las descendentes")
    ap.add_argument("--neurons", help="opcional: tabla de neuronas con lado y neurotransmisor")
    ap.add_argument("--out", default="subcircuito.json")
    ap.add_argument("--target-prefixes", default="LPLC,LC", help="tipos que puntuan a las entradas")
    ap.add_argument("--max-inputs", type=int, default=1600)
    ap.add_argument("--max-mid", type=int, default=1100)
    ap.add_argument("--min-syn", type=float, default=5)
    ap.add_argument("--swap-sides", action="store_true", help="invierte izquierda/derecha de las salidas de giro")
    ap.add_argument("--col-pre"); ap.add_argument("--col-post"); ap.add_argument("--col-syn")
    ap.add_argument("--col-side"); ap.add_argument("--col-nt")
    a = ap.parse_args()

    # ---------- anotaciones ----------
    ct = rd(a.cell_types, dtype={"root_id": "int64"})
    vt = rd(a.visual, dtype={"root_id": "int64"})
    ca = rd(a.columns, dtype={"root_id": "int64"})
    for c in ("root_id", "hemisphere", "type", "column_id", "x", "y"):
        if c not in ca.columns:
            sys.exit(f"--columns no tiene la columna '{c}'. Columnas: {list(ca.columns)}")
    side_of, nt_of = {}, {}
    if a.classification:
        cl = rd(a.classification, dtype={"root_id": "int64"})
        sc = a.col_side or pick(cl, ["side", "soma_side", "hemisphere"], "lado en --classification")
        side_of.update({int(r): norm_side(s) for r, s in zip(cl.root_id, cl[sc])})
    if a.neurons:
        nr = rd(a.neurons, dtype={"root_id": "int64"}, low_memory=False)
        sc = a.col_side or pick(nr, ["side", "soma_side", "hemisphere"], "lado en --neurons")
        side_of.update({int(r): norm_side(s) for r, s in zip(nr.root_id, nr[sc])})
        ntc = a.col_nt or pick(nr, ["nt_type", "top_nt", "nt", "neurotransmitter"], "neurotransmisor", required=False)
        if ntc:
            nt_of = dict(zip(nr.root_id, nr[ntc]))
    vside = {int(r.root_id): norm_side(r.side) for r in vt.itertuples() if str(r.side) in ("left", "right")}

    # ---------- salidas ----------
    out_rules = {"DNa02": None, "DNa01": None, "DNp09": 2, "DNp01": 3}
    out = {}
    for t, pool in out_rules.items():
        for rid in ct.loc[ct.primary_type.astype(str) == t, "root_id"].tolist():
            out[int(rid)] = (pool, t)
    if not out:
        sys.exit("No encontre neuronas descendentes DNa02/DNa01/DNp09/DNp01 en --cell-types.")

    # ---------- conexiones ----------
    head = rd(a.connections, nrows=5)
    pre_c = a.col_pre or pick(head, ["pre_root_id", "pre_pt_root_id", "Presynaptic_ID", "pre"], "neurona presinaptica")
    post_c = a.col_post or pick(head, ["post_root_id", "post_pt_root_id", "Postsynaptic_ID", "post"], "neurona postsinaptica")
    syn_c = a.col_syn or pick(head, ["syn_count", "weight", "synapses", "Connectivity", "n_syn"], "numero de sinapsis")
    nt_edge = pick(head, ["nt_type"], "nt_type", required=False)
    print(f"Leyendo conexiones ({pre_c}, {post_c}, {syn_c}); puede tardar un minuto...")
    cols = [pre_c, post_c, syn_c] + ([nt_edge] if nt_edge and not nt_of else [])
    E = rd(a.connections, usecols=cols, dtype={pre_c: "int64", post_c: "int64"})
    if nt_edge and not nt_of:
        m = E.groupby([pre_c, nt_edge])[syn_c].sum().reset_index().sort_values(syn_c).drop_duplicates(pre_c, keep="last")
        nt_of = dict(zip(m[pre_c], m[nt_edge]))
        E = E[[pre_c, post_c, syn_c]]
    E = E.groupby([pre_c, post_c], as_index=False)[syn_c].sum()
    E = E[E[syn_c] >= a.min_syn]
    E.columns = ["pre", "post", "w"]
    print(f"Conexiones totales tras el umbral: {len(E):,}")
    if not nt_of:
        print("  aviso: no hay neurotransmisores; todas las sinapsis seran excitadoras.")

    # ---------- lado de las descendentes de giro ----------
    turners = [r for r, (p, t) in out.items() if p is None]
    known = {r: side_of[r] for r in turners if side_of.get(r, -1) in (0, 1)}
    if len(known) < len(turners):
        print("Lado de DNa01/DNa02 no disponible: lo infiero por el lado de sus entradas visuales.")
        lab = {r: (1.0 if s_ == 0 else -1.0) for r, s_ in vside.items()}
        e1t = E[E.pre.isin(lab) & E.post.isin(turners)]
        d1 = (e1t.w * e1t.pre.map(lab)).groupby(e1t.post).sum()
        bytype = {}
        for r in turners:
            bytype.setdefault(out[r][1], []).append(r)
        for t, rs in bytype.items():
            rs.sort(key=lambda r: -float(d1.get(r, 0.0)))
            for k, r in enumerate(rs):
                if r not in known:
                    known[r] = 0 if k < len(rs) / 2 else 1
        print("  AVISO: lado estimado; si la nave gira al reves, repite con --swap-sides.")
    for r in turners:
        sd = known[r] if known.get(r, -1) in (0, 1) else 0
        out[r] = (1 - sd if a.swap_sides else sd, out[r][1])
    print("Salidas por grupo:", {p: sum(1 for v in out.values() if v[0] == p) for p in range(4)})
    OUT = set(out)

    # ---------- entradas: una neurona columnar por columna y por ojo ----------
    prefs = tuple(x.strip() for x in a.target_prefixes.split(",") if x.strip())
    targets = set(vt.loc[vt.type.astype(str).str.startswith(prefs), "root_id"].astype("int64")) | OUT
    cand = ca[~ca.root_id.isin(OUT)].copy()
    wt = E[E.pre.isin(set(cand.root_id)) & E.post.isin(targets)].groupby("pre").w.sum()
    cand["score"] = cand.root_id.map(wt).fillna(0.0)
    cand = cand[cand.score > 0]
    best = cand.sort_values("score", ascending=False).drop_duplicates(["hemisphere", "column_id"])
    best = best.sort_values("score", ascending=False).head(a.max_inputs)
    inputs = {}
    for r in best.itertuples():
        s = 0 if str(r.hemisphere).lower().startswith("l") else 1
        inputs[int(r.root_id)] = (s, str(r.type), float(r.x), float(r.y))
    tc = best.type.value_counts().to_dict()
    print(f"Entradas: {len(inputs)} neuronas columnares ({(best.hemisphere == 'left').sum()} izq., {(best.hemisphere == 'right').sum()} der.)")
    print("  tipos:", dict(list(tc.items())[:10]))
    IN = set(inputs)

    # ---------- intermedias ----------
    fromIN = E[E.pre.isin(IN) & ~E.post.isin(IN) & ~E.post.isin(OUT)].groupby("post").w.sum()
    toOUT = E[E.post.isin(OUT) & ~E.pre.isin(IN) & ~E.pre.isin(OUT)].groupby("pre").w.sum()
    both = fromIN.index.intersection(toOUT.index)
    sc = pd.DataFrame({"a": fromIN.reindex(both), "b": toOUT.reindex(both)})
    sc["s"] = np.minimum(sc.a, sc.b)
    mid = list(sc.sort_values("s", ascending=False).head(int(a.max_mid * 0.8)).index)
    left = a.max_mid - len(mid)
    seen = set(mid)
    extra = [i for i in fromIN.sort_values(ascending=False).index if i not in seen][: left // 2]
    seen |= set(extra)
    extra += [i for i in toOUT.sort_values(ascending=False).index if i not in seen][: left - len(extra)]
    mid += extra
    lcn = sum(1 for m in mid if m in set(vt.loc[vt.type.astype(str).str.startswith(prefs), "root_id"]))
    print(f"Intermedias: {len(mid)} ({len(both)} con camino entrada -> salida en 2 saltos; {lcn} son LC/LPLC)")

    # ---------- ensamblado ----------
    nodes, idx = [], {}
    for rid, (s, t, x, y) in inputs.items():
        idx[rid] = len(nodes); nodes.append([str(rid), 0, s, t, str(nt_of.get(rid, "")), x, y])
    for rid in mid:
        idx[int(rid)] = len(nodes); nodes.append([str(int(rid)), 1, 0, "", str(nt_of.get(int(rid), ""))])
    for rid, (p, t) in out.items():
        idx[rid] = len(nodes); nodes.append([str(rid), 2, p, t, str(nt_of.get(rid, ""))])
    S = set(idx)
    Es = E[E.pre.isin(S) & E.post.isin(S) & ~E.post.isin(IN) & ~E.pre.isin(OUT)]
    flat = []
    for r in Es.itertuples():
        sg = nt_sign(nt_of.get(r.pre, "ACH"))
        flat += [idx[r.pre], idx[r.post], round(float(r.w) * sg, 2)]
    print(f"Sinapsis en el subcircuito: {len(flat) // 3:,} conexiones entre {len(nodes)} neuronas")
    indeg = {}
    for k in range(0, len(flat), 3):
        indeg[flat[k + 1]] = indeg.get(flat[k + 1], 0) + 1
    for rid, (p, t) in out.items():
        if indeg.get(idx[rid], 0) == 0:
            print(f"  aviso: la salida {t} ({rid}) no recibe conexiones en este subcircuito")

    meta = {"xmin": float(ca.x.min()), "xmax": float(ca.x.max()), "ymin": float(ca.y.min()), "ymax": float(ca.y.max())}
    json.dump({"version": 2, "meta": meta, "pools": ["giro izq.", "giro der.", "empuje", "fuego"],
               "nodes": nodes, "edges": flat}, open(a.out, "w"), separators=(",", ":"))
    print(f"Listo: {a.out} ({os.path.getsize(a.out) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
