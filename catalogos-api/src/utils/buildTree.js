// MongoDB guarda los values como un arreglo plano; parentId indica quién es el padre.
// buildTree arma el árbol completo de forma recursiva y getChildren solo el primer nivel.

const byParent = (parentId) => (v) => (v.parentId ?? null) === parentId;
const bySequence = (a, b) => a.sequence - b.sequence;

export const buildTree = (values, parentId = null) =>
  values
    .filter(byParent(parentId))
    .sort(bySequence)
    .map((v) => ({ ...v, children: buildTree(values, v.id) }));

export const getChildren = (values, parentId = null) =>
  values.filter(byParent(parentId)).sort(bySequence);
