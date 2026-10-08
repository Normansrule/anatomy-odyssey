"""Generate 3D small-molecule geometry for the shared library.

    pip install rdkit
    python3 tools/gen_molecules.py      # writes src/library/data/molecules.json

Each molecule starts from a SMILES string (isomeric, charged as at body pH,
about 7.4). RDKit embeds 3D coordinates with ETKDG v3 and refines them with
the MMFF94 force field, using a fixed random seed so the output is
reproducible. The script checks every molecule's formula, net charge and
stereocenters (L-amino acids, D-sugars, natural sn-glycerol) before writing.

The output is data, not an asset download: nothing is fetched at run time.
RDKit is BSD-licensed; the generated coordinates are covered by the
project's MIT license.
"""
import json
import re
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolDescriptors

SEED = 20261002
OUT = Path("src/library/data/molecules.json")

# Natural L-amino acids, zwitterions; side chains charged as at pH 7.4
# (Asp, Glu negative; Lys, Arg positive; His neutral).
AA_TEMPLATE = "[NH3+][C@@H]({})C(=O)[O-]"
AMINO_ACIDS = [
    # id, name, 3-letter, 1-letter, side chain, group, formula, charge, CIP at alpha (and beta)
    ("gly", "Glycine", "Gly", "G", None, "nonpolar", "C2H5NO2", 0, {}),
    ("ala", "Alanine", "Ala", "A", "C", "nonpolar", "C3H7NO2", 0, {"CA": "S"}),
    ("val", "Valine", "Val", "V", "C(C)C", "nonpolar", "C5H11NO2", 0, {"CA": "S"}),
    ("leu", "Leucine", "Leu", "L", "CC(C)C", "nonpolar", "C6H13NO2", 0, {"CA": "S"}),
    ("ile", "Isoleucine", "Ile", "I", "[C@@H](C)CC", "nonpolar", "C6H13NO2", 0, {"CA": "S", "CB": "S"}),
    ("pro", "Proline", "Pro", "P", None, "nonpolar", "C5H9NO2", 0, {"CA": "S"}),
    ("phe", "Phenylalanine", "Phe", "F", "Cc1ccccc1", "nonpolar", "C9H11NO2", 0, {"CA": "S"}),
    ("trp", "Tryptophan", "Trp", "W", "Cc1c[nH]c2ccccc12", "nonpolar", "C11H12N2O2", 0, {"CA": "S"}),
    ("met", "Methionine", "Met", "M", "CCSC", "nonpolar", "C5H11NO2S", 0, {"CA": "S"}),
    ("ser", "Serine", "Ser", "S", "CO", "polar", "C3H7NO3", 0, {"CA": "S"}),
    ("thr", "Threonine", "Thr", "T", "[C@@H](C)O", "polar", "C4H9NO3", 0, {"CA": "S", "CB": "R"}),
    ("cys", "Cysteine", "Cys", "C", "CS", "polar", "C3H7NO2S", 0, {"CA": "R"}),
    ("tyr", "Tyrosine", "Tyr", "Y", "Cc1ccc(O)cc1", "polar", "C9H11NO3", 0, {"CA": "S"}),
    ("asn", "Asparagine", "Asn", "N", "CC(N)=O", "polar", "C4H8N2O3", 0, {"CA": "S"}),
    ("gln", "Glutamine", "Gln", "Q", "CCC(N)=O", "polar", "C5H10N2O3", 0, {"CA": "S"}),
    ("asp", "Aspartate", "Asp", "D", "CC(=O)[O-]", "acidic", "C4H6NO4", -1, {"CA": "S"}),
    ("glu", "Glutamate", "Glu", "E", "CCC(=O)[O-]", "acidic", "C5H8NO4", -1, {"CA": "S"}),
    ("lys", "Lysine", "Lys", "K", "CCCC[NH3+]", "basic", "C6H15N2O2", 1, {"CA": "S"}),
    ("arg", "Arginine", "Arg", "R", "CCCNC(N)=[NH2+]", "basic", "C6H15N4O2", 1, {"CA": "S"}),
    ("his", "Histidine", "His", "H", "Cc1cnc[nH]1", "basic", "C6H9N3O2", 0, {"CA": "S"}),
]
SPECIAL_AA = {
    "gly": "[NH3+]CC(=O)[O-]",
    "pro": "[NH2+]1CCC[C@H]1C(=O)[O-]",
}

# Nucleotides as nucleoside 5'-monophosphates (2− at pH 7.4).
# D-sugars: deoxyribose C1' R, C3' S, C4' R; ribose C1' R, C2' R, C3' S, C4' R.
NUCLEOTIDES = [
    ("damp", "dAMP (deoxyadenosine monophosphate)", "A", "DNA", "Nc1ncnc2n(cnc12)[C@H]1C[C@H](O)[C@@H](COP([O-])([O-])=O)O1", "C10H12N5O6P", -2),
    ("dtmp", "dTMP (thymidine monophosphate)", "T", "DNA", "Cc1cn([C@H]2C[C@H](O)[C@@H](COP([O-])([O-])=O)O2)c(=O)[nH]c1=O", "C10H13N2O8P", -2),
    ("dgmp", "dGMP (deoxyguanosine monophosphate)", "G", "DNA", "Nc1nc2n(cnc2c(=O)[nH]1)[C@H]1C[C@H](O)[C@@H](COP([O-])([O-])=O)O1", "C10H12N5O7P", -2),
    ("dcmp", "dCMP (deoxycytidine monophosphate)", "C", "DNA", "Nc1ccn([C@H]2C[C@H](O)[C@@H](COP([O-])([O-])=O)O2)c(=O)n1", "C9H12N3O7P", -2),
    ("amp", "AMP (adenosine monophosphate)", "A", "RNA", "Nc1ncnc2n(cnc12)[C@@H]1O[C@H](COP([O-])([O-])=O)[C@@H](O)[C@H]1O", "C10H12N5O7P", -2),
    ("ump", "UMP (uridine monophosphate)", "U", "RNA", "O=c1ccn([C@@H]2O[C@H](COP([O-])([O-])=O)[C@@H](O)[C@H]2O)c(=O)[nH]1", "C9H11N2O9P", -2),
    ("gmp", "GMP (guanosine monophosphate)", "G", "RNA", "Nc1nc2n(cnc2c(=O)[nH]1)[C@@H]1O[C@H](COP([O-])([O-])=O)[C@@H](O)[C@H]1O", "C10H12N5O8P", -2),
    ("cmp", "CMP (cytidine monophosphate)", "C", "RNA", "Nc1ccn([C@@H]2O[C@H](COP([O-])([O-])=O)[C@@H](O)[C@H]2O)c(=O)n1", "C9H12N3O8P", -2),
]

OTHERS = [
    ("atp", "ATP (adenosine triphosphate)", "Nc1ncnc2n(cnc12)[C@@H]1O[C@H](COP([O-])(=O)OP([O-])(=O)OP([O-])([O-])=O)[C@@H](O)[C@H]1O", "C10H12N5O13P3", -4),
    ("adp", "ADP (adenosine diphosphate)", "Nc1ncnc2n(cnc12)[C@@H]1O[C@H](COP([O-])(=O)OP([O-])([O-])=O)[C@@H](O)[C@H]1O", "C10H12N5O10P2", -3),
    ("pi", "Phosphate (HPO₄²⁻)", "OP([O-])([O-])=O", "HO4P", -2),
    # The carbon dioxide buffer system: CO₂ + H₂O ⇌ H₂CO₃ ⇌ H⁺ + HCO₃⁻ (the proton rides on a water as H₃O⁺).
    # CO₂ itself is not generated: MMFF94 stretches its C=O bonds to 1.40 Å, so the scenes use the
    # experimental 1.16 Å geometry from src/library/gases.js instead.
    ("water", "Water (H₂O)", "O", "H2O", 0),
    ("h2co3", "Carbonic acid (H₂CO₃)", "OC(O)=O", "CH2O3", 0),
    ("hco3", "Bicarbonate (HCO₃⁻)", "OC([O-])=O", "CHO3", -1),
    ("h3o", "Hydronium (H₃O⁺)", "[OH3+]", "H3O", 1),
    # POPC: 16:0 at sn-1, 18:1 cis-9 at sn-2, phosphocholine at sn-3 (glycerol C2 is R).
    # beta-D-glucopyranose, (2R,3R,4S,5S,6R)-6-(hydroxymethyl)oxane-2,3,4,5-tetrol: the sugar the gut absorbs.
    ("glucose", "Glucose (β-D-glucopyranose)", "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "C6H12O6", 0),
    # Acetylcholine, the neurotransmitter at the nerve-muscle junction (a quaternary ammonium, always +1).
    ("acetylcholine", "Acetylcholine", "CC(=O)OCC[N+](C)(C)C", "C7H16NO2", 1),
    # Histamine at body pH: the side-chain amine is protonated (+1); the imidazole ring is neutral,
    # with its hydrogen on the nitrogen far from the side chain (the N-tau tautomer, the common one).
    ("histamine", "Histamine", "[NH3+]CCc1c[nH]cn1", "C5H10N3", 1),
    # Urea, the form in which the body excretes the nitrogen from broken-down proteins.
    ("urea", "Urea", "NC(N)=O", "CH4N2O", 0),
    # Thyroid hormones, L form, with the amino-acid end charged as in water (NH3+ and COO-; net 0).
    # T4 carries four iodines (3,5,3',5'); T3 lacks the 5' iodine on the outer ring.
    ("thyroxine", "Thyroxine (T4)", "[NH3+][C@@H](Cc1cc(I)c(Oc2cc(I)c(O)c(I)c2)c(I)c1)C(=O)[O-]", "C15H11I4NO4", 0),
    ("t3", "Triiodothyronine (T3)", "[NH3+][C@@H](Cc1cc(I)c(Oc2ccc(O)c(I)c2)c(I)c1)C(=O)[O-]", "C15H12I3NO4", 0),
    # Vitamin D3 (cholecalciferol), made in the skin from 7-dehydrocholesterol by UVB light:
    # (3S, 13R, 14S, 17R, 20R), with its broken B ring giving 5Z,7E double bonds.
    ("vitamin-d3", "Vitamin D3 (cholecalciferol)", "C[C@H](CCCC(C)C)[C@H]1CC[C@@H]\\2[C@@]1(CCC/C2=C\\C=C/3\\C[C@H](CCC3=C)O)C", "C27H44O", 0),
    ("popc", "POPC (a phosphatidylcholine)", "CCCCCCCCCCCCCCCC(=O)OC[C@H](COP([O-])(=O)OCC[N+](C)(C)C)OC(=O)CCCCCCC/C=C\\CCCCCCCC", "C42H82NO8P", 0),
]


def formula(mol):
    # RDKit appends the net charge ("+", "-2"); strip it, the charge is checked separately.
    return re.sub(r"[+-]\d*$", "", rdMolDescriptors.CalcMolFormula(mol))


def embed(mol, n_confs, pick):
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    ids = list(AllChem.EmbedMultipleConfs(mol, numConfs=n_confs, params=params))
    if not ids:
        raise RuntimeError("embedding failed")
    results = AllChem.MMFFOptimizeMoleculeConfs(mol, maxIters=2000)
    energies = [e for (_, e) in results]
    best = pick(mol, ids, energies)
    return mol, best


def lowest_energy(_mol, ids, energies):
    return ids[min(range(len(ids)), key=lambda i: energies[i])]


def most_extended(mol, ids, energies):
    """For a lipid: a low-energy conformer with both tails stretched away from the head and lying side by side."""
    p = next(a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "P")
    ends = [a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetDegree() == 4 and sum(1 for n in a.GetNeighbors() if n.GetSymbol() == "C") == 1 and all(n.GetSymbol() in "CH" for n in a.GetNeighbors()) and not any(n.GetSymbol() == "N" for n in a.GetNeighbors())]
    e0 = min(energies)

    def score(k):
        conf = mol.GetConformer(ids[k])
        pp = conf.GetAtomPosition(p)
        e1, e2 = (conf.GetAtomPosition(i) for i in ends[:2])
        mid = (e1 + e2) / 2
        return (mid - pp).Length() - 0.8 * (e1 - e2).Length() - 0.05 * (energies[k] - e0)

    return ids[max(range(len(ids)), key=score)]


def export(mol, conf_id):
    Chem.Kekulize(mol, clearAromaticFlags=True)
    conf = mol.GetConformer(conf_id)
    pos = [conf.GetAtomPosition(i) for i in range(mol.GetNumAtoms())]
    heavy = [p for p, a in zip(pos, mol.GetAtoms()) if a.GetSymbol() != "H"]
    cx = sum(p.x for p in heavy) / len(heavy)
    cy = sum(p.y for p in heavy) / len(heavy)
    cz = sum(p.z for p in heavy) / len(heavy)
    atoms = [[a.GetSymbol(), round(p.x - cx, 3), round(p.y - cy, 3), round(p.z - cz, 3), a.GetFormalCharge()] for a, p in zip(mol.GetAtoms(), pos)]
    order = {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}
    bonds = [[b.GetBeginAtomIdx(), b.GetEndAtomIdx(), order[b.GetBondType()]] for b in mol.GetBonds()]
    return atoms, bonds


def check(mol, want_formula, want_charge, label):
    got = formula(mol)
    assert got == want_formula, f"{label}: formula {got} != {want_formula}"
    charge = Chem.GetFormalCharge(mol)
    assert charge == want_charge, f"{label}: charge {charge} != {want_charge}"


def alpha_and_beta(mol):
    """CIP labels of the alpha carbon (bonded to the NH3+/NH2+ nitrogen and a carboxylate carbon) and its side-chain neighbor."""
    from rdkit.Chem import rdCIPLabeler
    rdCIPLabeler.AssignCIPLabels(mol)
    for a in mol.GetAtoms():
        if a.GetSymbol() != "C":
            continue
        ns = [n for n in a.GetNeighbors() if n.GetSymbol() == "N" and n.GetFormalCharge() == 1]
        cs = [n for n in a.GetNeighbors() if n.GetSymbol() == "C" and sum(1 for o in n.GetNeighbors() if o.GetSymbol() == "O") == 2]
        if ns and cs:
            out = {"CA": a.GetProp("_CIPCode") if a.HasProp("_CIPCode") else None}
            for n in a.GetNeighbors():
                if n.GetSymbol() == "C" and n.GetIdx() != cs[0].GetIdx() and n.HasProp("_CIPCode"):
                    out["CB"] = n.GetProp("_CIPCode")
            return out
    return {}


def double_bond_labels(mol):
    from rdkit.Chem import rdCIPLabeler
    rdCIPLabeler.AssignCIPLabels(mol)
    return sorted(b.GetProp("_CIPCode") for b in mol.GetBonds() if b.HasProp("_CIPCode"))


def sugar_labels(mol):
    from rdkit.Chem import rdCIPLabeler
    rdCIPLabeler.AssignCIPLabels(mol)
    return sorted(a.GetProp("_CIPCode") for a in mol.GetAtoms() if a.HasProp("_CIPCode"))


def main():
    data = {"generator": "tools/gen_molecules.py (RDKit ETKDGv3 + MMFF94)", "seed": SEED, "molecules": {}}

    for mid, name, three, one, side, group, want_formula, charge, cip in AMINO_ACIDS:
        smi = SPECIAL_AA.get(mid) or AA_TEMPLATE.format(side)
        mol = Chem.MolFromSmiles(smi)
        check(mol, want_formula, charge, name)
        got = alpha_and_beta(Chem.Mol(mol))
        for k, v in cip.items():
            assert got.get(k) == v, f"{name}: {k} is {got.get(k)}, expected {v}"
        mol3, cid = embed(mol, 30, lowest_energy)
        atoms, bonds = export(mol3, cid)
        data["molecules"][mid] = {"name": name, "code3": three, "code1": one, "group": group, "kind": "amino-acid", "formula": want_formula, "charge": charge, "smiles": smi, "atoms": atoms, "bonds": bonds}

    for mid, name, base, polymer, smi, want_formula, charge in NUCLEOTIDES:
        mol = Chem.MolFromSmiles(smi)
        check(mol, want_formula, charge, name)
        labels = sugar_labels(Chem.Mol(mol))
        want = ["R", "R", "S"] if polymer == "DNA" else ["R", "R", "R", "S"]
        assert labels == want, f"{name}: sugar stereocenters {labels} != {want}"
        mol3, cid = embed(mol, 30, lowest_energy)
        atoms, bonds = export(mol3, cid)
        data["molecules"][mid] = {"name": name, "base": base, "polymer": polymer, "kind": "nucleotide", "formula": want_formula, "charge": charge, "smiles": smi, "atoms": atoms, "bonds": bonds}

    for mid, name, smi, want_formula, charge in OTHERS:
        mol = Chem.MolFromSmiles(smi)
        check(mol, want_formula, charge, name)
        if mid == "popc":
            labels = sugar_labels(Chem.Mol(mol))
            assert labels == ["R"], f"POPC glycerol stereocenter {labels}"
            mol3, cid = embed(mol, 300, most_extended)
        else:
            if mid in ("atp", "adp"):
                assert sugar_labels(Chem.Mol(mol)) == ["R", "R", "R", "S"], f"{name} ribose"
            if mid == "glucose":
                assert sugar_labels(Chem.Mol(mol)) == ["R", "R", "R", "S", "S"], f"{name}: not beta-D (2R,3R,4S,5S,6R)"
            if mid in ("thyroxine", "t3"):
                assert alpha_and_beta(Chem.Mol(mol)).get("CA") == "S", f"{name}: not the L form"
            if mid == "vitamin-d3":
                assert sugar_labels(Chem.Mol(mol)) == ["R", "R", "R", "S", "S"], f"{name}: stereocenters"
                assert double_bond_labels(Chem.Mol(mol)) == ["E", "Z"], f"{name}: not 5Z,7E"
            mol3, cid = embed(mol, 40, lowest_energy)
        atoms, bonds = export(mol3, cid)
        data["molecules"][mid] = {"name": name, "kind": "other", "formula": want_formula, "charge": charge, "smiles": smi, "atoms": atoms, "bonds": bonds}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    n_atoms = sum(len(m["atoms"]) for m in data["molecules"].values())
    print(f"wrote {OUT}: {len(data['molecules'])} molecules, {n_atoms} atoms")


if __name__ == "__main__":
    main()
