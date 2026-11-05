// MW4_COMMAND_SOURCE selects the Command board reader.
// Only "notion" (any case, surrounding space ignored) leaves Trello.
// Unset, empty, and every other value stay on Trello. Kal is not switched here.
function commandSourceMode(env) {
  const source = env || process.env;
  const raw = String(source.MW4_COMMAND_SOURCE == null ? '' : source.MW4_COMMAND_SOURCE)
    .replace(/[\r\n]+$/g, '')
    .trim()
    .toLowerCase();
  if (raw === 'notion') return 'notion';
  return 'trello';
}

module.exports = { commandSourceMode };
