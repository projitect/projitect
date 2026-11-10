/**
 * Minimal npm registry for the smoke test: serves packages from local tarballs so the public
 * `pjt add <pkg>` flow (which shells out `npm install -D <pkg>`) and a real package upgrade can be
 * exercised without publishing anything.
 *
 *   node scripts/local-registry.mjs <state.json> <port-file>
 *
 * `state.json` is re-read on every request, so rewriting it "publishes" a new version:
 *   { "packages": [{ "name": "@scope/pkg", "latest": "1.1.0", "tarballs": { "1.0.0": "/abs/a.tgz", ... } }] }
 * The chosen port is written to `<port-file>` once the server is listening.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import process from "node:process"
import { URL } from "node:url"

const [stateFile, portFile] = process.argv.slice(2)

const readState = () => JSON.parse(readFileSync(stateFile, "utf8"))

const manifestOf = (tarball) =>
  JSON.parse(execFileSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }))

const send = (res, status, body, type) => {
  res.writeHead(status, { "content-type": type })
  res.end(body)
}

const server = createServer((req, res) => {
  const state = readState()
  const { pathname } = new URL(req.url, "http://127.0.0.1")
  const base = `http://${req.headers.host}`

  const packument = state.packages.find((pkg) => decodeURIComponent(pathname) === `/${pkg.name}`)
  if (packument !== undefined) {
    const versions = Object.fromEntries(
      Object.entries(packument.tarballs).map(([version, tarball]) => [
        version,
        {
          ...manifestOf(tarball),
          dist: {
            tarball: `${base}/tarballs/${packument.name}/${version}.tgz`,
            integrity: `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`,
          },
        },
      ]),
    )
    send(
      res,
      200,
      JSON.stringify({
        name: packument.name,
        "dist-tags": { latest: packument.latest },
        versions,
      }),
      "application/json",
    )
    return
  }

  const match = /^\/tarballs\/(?<name>.+)\/(?<version>[^/]+)\.tgz$/u.exec(
    decodeURIComponent(pathname),
  )
  const tarball =
    match === null
      ? undefined
      : state.packages.find((pkg) => pkg.name === match.groups.name)?.tarballs[match.groups.version]
  if (tarball === undefined) {
    send(res, 404, "{}", "application/json")
    return
  }
  send(res, 200, readFileSync(tarball), "application/octet-stream")
})

server.listen(0, "127.0.0.1", () => {
  writeFileSync(portFile, String(server.address().port))
})
