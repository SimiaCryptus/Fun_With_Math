export function sageScript(n, word) {
  return `# Ribbon Engine export (word = beta_int * Delta^m)
B = BraidGroup(${Math.max(n, 2)})
b = B([${word.join(', ')}])
print("components in closure:", b.components_in_closure())
L = Link(b)
print("PD:", L.pd_code())
`;
}

export function snappyScript(word) {
  return `import snappy
# strand count is inferred from the largest generator
L = snappy.Link(braid_closure=[${word.join(', ')}])
print(L, "components:", len(L.link_components))
`;
}