const binding = { language: () => ({}) };
binding.nodeTypeInfo = {};
const queries = [
  "HIGHLIGHTS_QUERY",
  "INJECTIONS_QUERY",
  "LOCALS_QUERY",
  "TAGS_QUERY",
];
for (const prop of queries) {
  Object.defineProperty(binding, prop, {
    configurable: true,
    enumerable: true,
    get() {
      delete binding[prop];
      binding[prop] = "";
      return binding[prop];
    },
  });
}
module.exports = binding;
