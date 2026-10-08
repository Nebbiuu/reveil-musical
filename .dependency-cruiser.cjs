/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are strictly forbidden to maintain high cohesion and low coupling.',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'domain-cannot-depend-on-infra-or-app',
      severity: 'error',
      comment: 'Domain layer must remain pure and cannot depend on application, infrastructure, or composition-root.',
      from: {
        path: '^src/domain'
      },
      to: {
        path: '^src/(application|infrastructure|composition-root)'
      }
    },
    {
      name: 'domain-cannot-depend-on-external-modules',
      severity: 'error',
      comment: 'Domain layer must have zero external runtime library dependencies.',
      from: {
        path: '^src/domain'
      },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev'
        ]
      }
    },
    {
      name: 'application-cannot-depend-on-infrastructure',
      severity: 'error',
      comment: 'Application layer depends only on Domain (ports/models) and must not depend on Infrastructure or Composition Root.',
      from: {
        path: '^src/application'
      },
      to: {
        path: '^src/(infrastructure|composition-root)'
      }
    },
    {
      name: 'infrastructure-cannot-depend-on-composition-root',
      severity: 'error',
      comment: 'Infrastructure layer implements Domain/Application ports and must not depend on Composition Root.',
      from: {
        path: '^src/infrastructure'
      },
      to: {
        path: '^src/composition-root'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json'
    },
    reporterOptions: {
      text: {
        highlightFocused: true
      }
    }
  }
};
