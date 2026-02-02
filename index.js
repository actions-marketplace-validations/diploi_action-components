const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const core = require('@actions/core');

const envKeyRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;

try {
  const config = yaml.load(fs.readFileSync('diploi.yaml', 'utf-8'));
  const componentsOutput = [];

  for (const component of config.components) {
    let folder = component.folder || component.identifier;
    if (folder === '/') {
      folder = '.';
    }
    if (folder.startsWith('/')) {
      folder = folder.substring(1);
    }

    if (!fs.existsSync(folder)) {
      throw new Error(
        `Folder "${folder}" for the ${component.identifier} component is missing.`,
      );
    }

    let env = [];
    if (
      'env' in component &&
      'include' in component.env &&
      typeof component.env.include !== 'string' &&
      Array.isArray(component.env.include)
    ) {
      env = component.env.include
        .filter(
          (entry) =>
            typeof entry === 'object' &&
            entry &&
            'name' in entry &&
            'value' in entry,
        )
        .map((entry) => {
          const key = String(entry.name);
          const value = String(entry.value);

          if (!envKeyRegex.test(key)) {
            throw new Error(
              `Invalid ENV name "${key}". Must match ${envKeyRegex}`,
            );
          }

          if (value.includes('\n') || value.includes('\r')) {
            throw new Error(
              `ENV "${key}" contains newline characters. Multiline values are not supported via diploi.yaml.`,
            );
          }

          if (value.includes('\u0000')) {
            throw new Error(`ENV "${key}" contains a null byte.`);
          }

          return `${key}=${value}`;
        });
    }

    const isDevImageAvailable = fs.existsSync(
      path.join(folder, 'Dockerfile.dev'),
    );

    const componentOutput = {
      identifier: component.identifier,
      name: component.name || component.identifier,
      folder,
      type: isDevImageAvailable ? 'main' : 'main-dev',
      buildArgs: env.join('\n'),
    };

    componentsOutput.push(componentOutput);

    if (isDevImageAvailable) {
      componentsOutput.push({
        ...componentOutput,
        name: `${componentOutput.name} Dev`,
        type: 'dev',
      });
    }
  }

  core.info(JSON.stringify(componentsOutput));
  core.setOutput('components', JSON.stringify(componentsOutput));
} catch (error) {
  core.setFailed(error.message);
}
