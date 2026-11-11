/** The project the demo plans against: a package and a `.gitignore` that exist before pjt runs. */
export const seedFiles: Readonly<Record<string, string>> = {
  ".gitignore": "node_modules/\n.env\n",
  "package.json":
    '{\n  "name": "my-app",\n  "version": "1.0.0",\n  "scripts": {\n    "test": "echo todo"\n  }\n}\n',
}
