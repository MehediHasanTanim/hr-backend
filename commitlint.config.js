module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['api', 'worker', 'shared', 'prisma', 'ci', 'infra', 'docs']],
  },
};
