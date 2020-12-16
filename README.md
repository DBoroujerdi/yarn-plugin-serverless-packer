# yarn-plugin-serverless-packer

Yarn 2 plugin for generating lambda zip archives from yarn 2  projects

## Getting Started

```
yarn plugin import https://github.com/DBoroujerdi/yarn-plugin-serverless-packer/releases/download/0.0.1/plugin-serverless-packer.js
```

## Examples

1. Create a zip from the active workspace
```
yarn packageLambda
```

This will generate a `lambda.zip` file in the root of the workspace

2. Define a different name of the output zip

```
yarn packageLambda --out output.zip
```

3. Package lambda source that was compiled with Typescript

```
yarn packageLambda --out lambda.zip --src-dir dist/
```

4. Only package the dependencies in the zip - useful for layers only containing node_modules

```
yarn packageLambda --deps-only --out layer.zip
```
