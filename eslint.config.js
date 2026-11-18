const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['main.js', 'preload.js', 'test/**/*.js'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['pet/**/*.js', 'notes/**/*.js'],
    languageOptions: { globals: globals.browser }
  }
];
